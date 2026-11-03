import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
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

    const sig = await conn.requestAirdrop(vaultKeypair.publicKey, lamports);
    await conn.confirmTransaction(sig, "confirmed");

    const newBalance = await conn.getBalance(vaultKeypair.publicKey);

    return NextResponse.json({
      airdroppedSol: requestedSol,
      signature: sig,
      vaultPublicKey: vaultKeypair.publicKey.toBase58(),
      newBalanceLamports: newBalance.toString(),
    });
  } catch (error) {
    console.error("Vault devnet airdrop error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Devnet RPC faucet rate-limited (${error.message}). Use the 'Deposit SOL to Vault' button right above to fund from your connected wallet.`
            : "Devnet airdrop failed",
      },
      { status: 500 }
    );
  }
}
