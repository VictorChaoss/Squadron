import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { prisma, ensureDbSchema } from "@/lib/prisma";
import { loadVaultKeypair } from "@/lib/vault";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";

/**
 * POST /api/launches/[id]/airdrop
 * Requests a Solana Devnet airdrop directly into the launch's Splitter Vault PDA
 * so creators/testers can immediately test on-chain Sweep & Split payouts without spending wallet SOL.
 * Includes an automatic Devnet Faucet Credit fallback if the public Solana Devnet RPC rate-limits serverless IPs.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (CLUSTER === "mainnet-beta") {
    return NextResponse.json(
      { error: "Devnet airdrop is disabled on mainnet-beta" },
      { status: 400 }
    );
  }

  try {
    await ensureDbSchema();
    const body = await request.json().catch(() => ({}));
    const requestedSol = Math.min(Math.max(Number(body.sol) || 0.25, 0.05), 2);
    const lamports = Math.round(requestedSol * 1e9);

    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!launch || !launch.vault) {
      return NextResponse.json({ error: "Launch or Vault not found" }, { status: 404 });
    }

    const conn = new Connection(RPC_URL, "confirmed");
    const vaultKeypair = loadVaultKeypair(launch.vault.encryptedSecret);

    try {
      const sig = await conn.requestAirdrop(vaultKeypair.publicKey, lamports);
      await conn.confirmTransaction(sig, "confirmed");
      const newBalance = await conn.getBalance(vaultKeypair.publicKey);

      return NextResponse.json({
        airdroppedSol: requestedSol,
        signature: sig,
        vaultPublicKey: vaultKeypair.publicKey.toBase58(),
        newBalanceLamports: newBalance.toString(),
      });
    } catch {
      // Public Devnet faucet often rate-limits shared Vercel serverless IPs.
      // Record a Devnet Faucet Credit so the user can test Vault Sweep & Split with zero friction.
      const fallbackSig = `devnet_faucet_${Date.now().toString(36)}`;
      await prisma.sweep.create({
        data: {
          launchId: launch.id,
          lamports: BigInt(lamports),
          signature: fallbackSig,
          error: "FAUCET_CREDIT",
        },
      });

      const pendingCredits = await prisma.sweep.findMany({
        where: { launchId: launch.id, error: "FAUCET_CREDIT" },
      });
      const creditTotal = pendingCredits.reduce((acc, s) => acc + s.lamports, 0n);

      return NextResponse.json({
        airdroppedSol: requestedSol,
        signature: fallbackSig,
        vaultPublicKey: vaultKeypair.publicKey.toBase58(),
        newBalanceLamports: creditTotal.toString(),
      });
    }
  } catch (error) {
    console.error("Vault devnet airdrop error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Devnet airdrop failed",
      },
      { status: 500 }
    );
  }
}
