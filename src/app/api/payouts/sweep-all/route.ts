import { NextResponse } from "next/server";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { loadVaultKeypair } from "@/lib/vault";
import { getSquadProvider } from "@/lib/squads";
import { splitLamports, RoleWeights, EQUAL_WEIGHTS } from "@/lib/split";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const RENT_EXEMPTION_RESERVE = 1_500_000n;
const MIN_PAYOUT_LAMPORTS = BigInt(
  process.env.MIN_PAYOUT_LAMPORTS || "1000000"
);

/**
 * POST /api/payouts/sweep-all
 * Permissionlessly scans every active Splitter Vault across the entire Squadron protocol,
 * re-syncs each squad's active roster, and executes pro-rata SOL payout transactions for all funded vaults.
 */
export async function POST() {
  try {
    const launches = await prisma.launch.findMany({
      where: { status: "LIVE" },
      include: {
        vault: true,
        squad: {
          include: {
            members: { where: { active: true } },
          },
        },
      },
    });

    if (launches.length === 0) {
      return NextResponse.json({
        sweptVaultsCount: 0,
        totalDistributedLamports: "0",
        totalRecipientsPaid: 0,
        results: [],
      });
    }

    const conn = new Connection(RPC_URL, "confirmed");
    const provider = await getSquadProvider();

    let sweptVaultsCount = 0;
    let totalDistributedLamports = 0n;
    let totalRecipientsPaid = 0;

    const results: {
      launchId: string;
      symbol: string;
      squadUsername: string;
      vaultPublicKey: string;
      splitExecuted: boolean;
      distributedLamports: string;
      recipientsCount: number;
      signature: string | null;
    }[] = [];

    for (const launch of launches) {
      if (!launch.vault) continue;

      try {
        // 1. Re-sync non-custom squad rosters
        if (!launch.squadId.startsWith("custom-")) {
          const freshSquad = await provider.getSquad(launch.squadId);
          if (freshSquad) {
            const activeUserIds = freshSquad.members.map((m) => m.userId);
            await prisma.member.updateMany({
              where: {
                squadId: launch.squadId,
                userId: { notIn: activeUserIds },
              },
              data: { active: false },
            });
            for (const m of freshSquad.members) {
              if (!m.walletAddress) continue;
              await prisma.member.upsert({
                where: {
                  squadId_userId: {
                    squadId: launch.squadId,
                    userId: m.userId,
                  },
                },
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
        }

        const vaultKeypair = loadVaultKeypair(launch.vault.encryptedSecret);
        const balance = BigInt(await conn.getBalance(vaultKeypair.publicKey));

        if (balance <= RENT_EXEMPTION_RESERVE + MIN_PAYOUT_LAMPORTS) {
          results.push({
            launchId: launch.id,
            symbol: launch.symbol,
            squadUsername: launch.squad.username,
            vaultPublicKey: vaultKeypair.publicKey.toBase58(),
            splitExecuted: false,
            distributedLamports: "0",
            recipientsCount: 0,
            signature: null,
          });
          continue;
        }

        const totalDistributable = balance - RENT_EXEMPTION_RESERVE;
        const treasuryStr =
          process.env.SQUADRON_TREASURY_WALLET ||
          process.env.PLATFORM_TREASURY ||
          "";
        const platformFeeBps = BigInt(
          launch.platformBps || Number(process.env.PLATFORM_FEE_BPS || 0)
        );

        let treasuryPubkey: PublicKey | null = null;
        let protocolFeeLamports = 0n;
        if (treasuryStr && platformFeeBps > 0n) {
          try {
            treasuryPubkey = new PublicKey(treasuryStr);
            protocolFeeLamports =
              (totalDistributable * platformFeeBps) / 10_000n;
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

        if (allocations.length === 0) continue;

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

        const sig = await conn.sendTransaction(tx, [vaultKeypair]);
        await conn.confirmTransaction(sig, "confirmed");

        const batchId = `batch_${Date.now()}_${launch.symbol.toLowerCase()}`;
        for (const alloc of allocations) {
          await prisma.payout.create({
            data: {
              launchId: launch.id,
              batchId,
              walletAddress: alloc.walletAddress,
              userId: alloc.userId,
              lamports: alloc.lamports,
              signature: sig,
              status: "SENT",
            },
          });
        }

        sweptVaultsCount += 1;
        totalDistributedLamports += squadDistributable;
        totalRecipientsPaid += allocations.length;

        results.push({
          launchId: launch.id,
          symbol: launch.symbol,
          squadUsername: launch.squad.username,
          vaultPublicKey: vaultKeypair.publicKey.toBase58(),
          splitExecuted: true,
          distributedLamports: squadDistributable.toString(),
          recipientsCount: allocations.length,
          signature: sig,
        });
      } catch (innerErr) {
        console.error(`Failed sweeping vault for launch ${launch.id}:`, innerErr);
      }
    }

    return NextResponse.json({
      sweptVaultsCount,
      totalDistributedLamports: totalDistributedLamports.toString(),
      totalRecipientsPaid,
      results,
    });
  } catch (error) {
    console.error("POST /api/payouts/sweep-all error:", error);
    return NextResponse.json(
      { error: "Failed to sweep all vaults" },
      { status: 500 }
    );
  }
}
