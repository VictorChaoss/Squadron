import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const RENT_EXEMPTION_RESERVE = 1_500_000n;

/**
 * GET /api/payouts
 * Global live feed of all Splitter Vaults, on-chain payout batches, and per-member transfers.
 */
export async function GET() {
  try {
    const [launches, payouts, activeMembersCount] = await Promise.all([
      prisma.launch.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          vault: { select: { publicKey: true, createdAt: true } },
          squad: {
            select: {
              id: true,
              username: true,
              memberCount: true,
              profileImageUrl: true,
            },
          },
          _count: {
            select: { payouts: true, sweeps: true },
          },
        },
      }),
      prisma.payout.findMany({
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          launch: {
            select: {
              id: true,
              name: true,
              symbol: true,
              mint: true,
              squadId: true,
              squadBps: true,
              squad: {
                select: {
                  username: true,
                },
              },
            },
          },
        },
      }),
      prisma.member.count({ where: { active: true } }),
    ]);

    // Query live Solana balances for all Splitter Vaults in one RPC call
    const conn = new Connection(RPC_URL, "confirmed");
    const vaultPubkeys: PublicKey[] = [];
    const validLaunchIndices: number[] = [];

    launches.forEach((l, idx) => {
      if (l.vault?.publicKey) {
        try {
          vaultPubkeys.push(new PublicKey(l.vault.publicKey));
          validLaunchIndices.push(idx);
        } catch {}
      }
    });

    const balancesByLaunchId = new Map<string, bigint>();
    if (vaultPubkeys.length > 0) {
      try {
        const infos = await conn.getMultipleAccountsInfo(vaultPubkeys);
        infos.forEach((info, i) => {
          const launch = launches[validLaunchIndices[i]];
          balancesByLaunchId.set(launch.id, BigInt(info?.lamports ?? 0));
        });
      } catch {
        // Fallback if RPC rate limits getMultipleAccountsInfo
      }
    }

    // Aggregate historical distributed lamports per launch
    const paidByLaunchId = new Map<string, bigint>();
    let totalProtocolDistributedLamports = 0n;
    for (const p of payouts) {
      if (p.status === "SENT") {
        totalProtocolDistributedLamports += p.lamports;
        paidByLaunchId.set(
          p.launchId,
          (paidByLaunchId.get(p.launchId) ?? 0n) + p.lamports
        );
      }
    }

    // Group payouts into batch receipts
    const batchMap = new Map<
      string,
      {
        batchId: string;
        launchId: string;
        coinName: string;
        coinSymbol: string;
        mint: string;
        squadId: string;
        squadUsername: string;
        signature: string | null;
        createdAt: string;
        totalLamports: bigint;
        recipientsCount: number;
      }
    >();

    for (const p of payouts) {
      const existing = batchMap.get(p.batchId);
      if (existing) {
        existing.totalLamports += p.lamports;
        existing.recipientsCount += 1;
      } else {
        batchMap.set(p.batchId, {
          batchId: p.batchId,
          launchId: p.launchId,
          coinName: p.launch.name,
          coinSymbol: p.launch.symbol,
          mint: p.launch.mint,
          squadId: p.launch.squadId,
          squadUsername: p.launch.squad.username,
          signature: p.signature,
          createdAt: p.createdAt.toISOString(),
          totalLamports: p.lamports,
          recipientsCount: 1,
        });
      }
    }

    let totalPendingInVaultsLamports = 0n;

    const vaults = launches.map((l) => {
      const rawBal = balancesByLaunchId.get(l.id) ?? 0n;
      const distributable =
        rawBal > RENT_EXEMPTION_RESERVE ? rawBal - RENT_EXEMPTION_RESERVE : 0n;
      totalPendingInVaultsLamports += distributable;

      return {
        launchId: l.id,
        name: l.name,
        symbol: l.symbol,
        mint: l.mint,
        imageUrl: l.imageUrl,
        squadId: l.squadId,
        squadUsername: l.squad.username,
        memberCount: l.squad.memberCount,
        squadBps: l.squadBps,
        creatorBps: l.creatorBps,
        vaultPublicKey: l.vault?.publicKey || "",
        vaultBalanceLamports: rawBal.toString(),
        distributableLamports: distributable.toString(),
        totalPaidLamports: (paidByLaunchId.get(l.id) ?? 0n).toString(),
        payoutsCount: l._count.payouts,
        createdAt: l.createdAt.toISOString(),
      };
    });

    const batches = Array.from(batchMap.values()).map((b) => ({
      ...b,
      totalLamports: b.totalLamports.toString(),
    }));

    return NextResponse.json({
      stats: {
        activeVaultsCount: vaults.length,
        totalPendingInVaultsLamports: totalPendingInVaultsLamports.toString(),
        totalDistributedLamports: totalProtocolDistributedLamports.toString(),
        totalBatchesCount: batches.length,
        activeMembersCount,
      },
      vaults,
      batches,
      recentPayouts: payouts.slice(0, 50).map((p) => ({
        id: p.id,
        batchId: p.batchId,
        launchId: p.launchId,
        coinName: p.launch.name,
        coinSymbol: p.launch.symbol,
        squadId: p.launch.squadId,
        squadUsername: p.launch.squad.username,
        walletAddress: p.walletAddress,
        lamports: p.lamports.toString(),
        signature: p.signature,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/payouts error:", error);
    return NextResponse.json(
      { error: "Failed to load global payouts feed" },
      { status: 500 }
    );
  }
}
