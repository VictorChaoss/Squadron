import { NextResponse } from "next/server";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { prisma, ensureLaunchHydrated } from "@/lib/prisma";
import { loadVaultKeypair } from "@/lib/vault";
import { getSquadProvider } from "@/lib/squads";
import { splitLamports, RoleWeights, EQUAL_WEIGHTS } from "@/lib/split";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
const RENT_EXEMPTION_RESERVE = 1_500_000n; // 0.0015 SOL reserve for rent + gas
const MIN_PAYOUT_LAMPORTS = BigInt(process.env.MIN_PAYOUT_LAMPORTS || "1000000"); // 0.001 SOL threshold

/**
 * POST /api/launches/[id]/sweep
 * Permissionlessly triggers roster re-sync, builds on-chain fee sweep/distribute instructions,
 * and executes the vault pro-rata split (with optional protocol fee cut) if vault holds balance.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const callerWallet = body.callerWallet as string | undefined;
  const clientFaucetLamports =
    CLUSTER !== "mainnet-beta" && body.faucetLamports
      ? BigInt(body.faucetLamports)
      : 0n;

  try {
    await ensureLaunchHydrated(id);
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: {
        vault: true,
        sweeps: { where: { error: "FAUCET_CREDIT" } },
        squad: {
          include: {
            members: { where: { active: true } },
          },
        },
      },
    });

    if (!launch) {
      return NextResponse.json({ error: "Launch not found" }, { status: 404 });
    }

    // 1. Re-sync squad roster before splitting
    const provider = await getSquadProvider();
    const freshSquad = await provider.getSquad(launch.squadId);
    if (freshSquad && !launch.squadId.startsWith("custom-")) {
      const activeUserIds = freshSquad.members.map((m) => m.userId);
      await prisma.member.updateMany({
        where: { squadId: launch.squadId, userId: { notIn: activeUserIds } },
        data: { active: false },
      });
      for (const m of freshSquad.members) {
        if (!m.walletAddress) continue;
        await prisma.member.upsert({
          where: { squadId_userId: { squadId: launch.squadId, userId: m.userId } },
          create: {
            squadId: launch.squadId,
            userId: m.userId,
            username: m.username,
            walletAddress: m.walletAddress,
            role: m.role,
            active: true,
            syncedAt: new Date(),
          },
          update: {
            username: m.username,
            walletAddress: m.walletAddress,
            role: m.role,
            active: true,
            syncedAt: new Date(),
          },
        });
      }
    }

    const conn = new Connection(RPC_URL, "confirmed");
    const vaultKeypair = loadVaultKeypair(launch.vault.encryptedSecret);
    let onChainBalance = 0n;
    try {
      onChainBalance = BigInt(await conn.getBalance(vaultKeypair.publicKey));
    } catch {
      onChainBalance = 0n;
    }

    const dbFaucetCredits = launch.sweeps.reduce((acc, s) => acc + s.lamports, 0n);
    const faucetCredits =
      dbFaucetCredits > 0n ? dbFaucetCredits : clientFaucetLamports;
    const balance = onChainBalance + faucetCredits;

    let splitTxSignature: string | null = null;
    let distributedLamports = 0n;
    let protocolFeeLamports = 0n;
    let recipientsCount = 0;
    const createdPayouts: {
      id: string;
      batchId: string;
      walletAddress: string;
      userId: string | null;
      lamports: string;
      signature: string | null;
      status: string;
      createdAt: string;
    }[] = [];
    let createdBatch: {
      batchId: string;
      signature: string | null;
      createdAt: string;
      totalLamports: string;
      recipientsCount: number;
    } | null = null;

    // 2. If vault has distributable SOL (either on-chain or Devnet Faucet Credit), split and send to all active members immediately
    if (balance > RENT_EXEMPTION_RESERVE + MIN_PAYOUT_LAMPORTS) {
      const totalDistributable = balance - RENT_EXEMPTION_RESERVE;

      // Optional Protocol Fee Cut on Vault Split
      const treasuryStr =
        process.env.SQUADRON_TREASURY_WALLET || process.env.PLATFORM_TREASURY || "";
      const platformFeeBps = BigInt(
        launch.platformBps || Number(process.env.PLATFORM_FEE_BPS || 0)
      );

      let treasuryPubkey: PublicKey | null = null;
      if (treasuryStr && platformFeeBps > 0n) {
        try {
          treasuryPubkey = new PublicKey(treasuryStr);
          protocolFeeLamports = (totalDistributable * platformFeeBps) / 10_000n;
        } catch {
          treasuryPubkey = null;
          protocolFeeLamports = 0n;
        }
      }

      const squadDistributable = totalDistributable - protocolFeeLamports;

      const activeMembers = await prisma.member.findMany({
        where: { squadId: launch.squadId, active: true },
      });

      let weights: RoleWeights = EQUAL_WEIGHTS;
      try {
        weights = JSON.parse(launch.roleWeightsJson);
      } catch {}

      const allocations = splitLamports(
        squadDistributable,
        activeMembers.map((m) => ({
          walletAddress: m.walletAddress,
          role: m.role as "OWNER" | "ADMIN" | "MEMBER",
          userId: m.userId,
        })),
        weights
      );

      if (allocations.length > 0) {
        if (onChainBalance > RENT_EXEMPTION_RESERVE + MIN_PAYOUT_LAMPORTS) {
          const tx = new Transaction();
          tx.add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 25_000 })
          );

          if (treasuryPubkey && protocolFeeLamports > 0n) {
            tx.add(
              SystemProgram.transfer({
                fromPubkey: vaultKeypair.publicKey,
                toPubkey: treasuryPubkey,
                lamports: Number(protocolFeeLamports),
              })
            );
          }

          for (const alloc of allocations) {
            if (alloc.lamports <= 0n) continue;
            tx.add(
              SystemProgram.transfer({
                fromPubkey: vaultKeypair.publicKey,
                toPubkey: new PublicKey(alloc.walletAddress),
                lamports: Number(alloc.lamports),
              })
            );
          }

          splitTxSignature = await conn.sendTransaction(tx, [vaultKeypair]);
          await conn.confirmTransaction(splitTxSignature, "confirmed");
        } else {
          // Devnet Faucet Credit split when public Devnet faucet was rate-limited
          splitTxSignature = `devnet_split_${Date.now().toString(36)}`;
        }

        if (faucetCredits > 0n) {
          await prisma.sweep.updateMany({
            where: { launchId: launch.id, error: "FAUCET_CREDIT" },
            data: { error: "SWEPT" },
          });
        }

        const batchId = `batch_${Date.now()}`;
        const nowIso = new Date().toISOString();
        for (const alloc of allocations) {
          const p = await prisma.payout.create({
            data: {
              launchId: launch.id,
              batchId,
              walletAddress: alloc.walletAddress,
              userId: alloc.userId,
              lamports: alloc.lamports,
              signature: splitTxSignature,
              status: "SENT",
            },
          });
          createdPayouts.push({
            id: p.id,
            batchId: p.batchId,
            walletAddress: p.walletAddress,
            userId: p.userId,
            lamports: p.lamports.toString(),
            signature: p.signature,
            status: p.status,
            createdAt: p.createdAt.toISOString(),
          });
        }
        distributedLamports = squadDistributable;
        recipientsCount = allocations.length;
        createdBatch = {
          batchId,
          signature: splitTxSignature,
          createdAt: nowIso,
          totalLamports: squadDistributable.toString(),
          recipientsCount: allocations.length,
        };
      }
    }

    // 3. Also build on-chain curve -> vault distribute instructions if caller wants to sign
    let serializedCurveSweepIxs: {
      programId: string;
      keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
      data: string;
    }[] = [];

    if (callerWallet) {
      try {
        const onlineSdk = new OnlinePumpSdk(conn);
        const { instructions } = await onlineSdk.buildDistributeCreatorFeesInstructions(
          new PublicKey(launch.mint),
          { payer: new PublicKey(callerWallet) }
        );
        serializedCurveSweepIxs = instructions.map((ix) => ({
          programId: ix.programId.toBase58(),
          keys: ix.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(ix.data).toString("base64"),
        }));
      } catch {
        // Curve may not exist on devnet if not yet confirmed or zero fees accrued
      }
    }

    return NextResponse.json({
      rosterSynced: !!freshSquad,
      memberCount: freshSquad?.members.length ?? launch.squad.members.length,
      vaultPublicKey: vaultKeypair.publicKey.toBase58(),
      vaultBalanceLamports: balance.toString(),
      splitExecuted: !!splitTxSignature,
      splitTxSignature,
      distributedLamports: distributedLamports.toString(),
      protocolFeeLamports: protocolFeeLamports.toString(),
      recipientsCount,
      createdPayouts,
      createdBatch,
      curveSweepInstructions: serializedCurveSweepIxs,
    });
  } catch (error) {
    console.error("Manual sweep/split error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sweep and split" },
      { status: 500 }
    );
  }
}
