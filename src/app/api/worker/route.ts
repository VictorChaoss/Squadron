import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";

/**
 * GET /api/worker
 * Returns live status of the Squadron Auto-Sweeper engine, protocol treasury configuration,
 * RPC latency/blockHeight, and recent automated/manual sweep logs.
 */
export async function GET() {
  try {
    const startMs = Date.now();
    const conn = new Connection(RPC_URL, "confirmed");

    let blockHeight = 0;
    let rpcHealthy = false;
    try {
      blockHeight = await conn.getBlockHeight();
      rpcHealthy = true;
    } catch {
      rpcHealthy = false;
    }
    const rpcLatencyMs = Date.now() - startMs;

    const treasuryWallet =
      process.env.SQUADRON_TREASURY_WALLET ||
      process.env.PLATFORM_TREASURY ||
      "";
    const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS || 0);
    const minPayoutLamports = process.env.MIN_PAYOUT_LAMPORTS || "1000000";

    let treasuryBalanceLamports = "0";
    if (treasuryWallet) {
      try {
        const bal = await conn.getBalance(new PublicKey(treasuryWallet));
        treasuryBalanceLamports = bal.toString();
      } catch {
        treasuryBalanceLamports = "0";
      }
    }

    const [activeLaunchesCount, totalBatches, recentPayouts] = await Promise.all([
      prisma.launch.count({ where: { status: "LIVE" } }),
      prisma.payout.groupBy({
        by: ["batchId"],
        _sum: { lamports: true },
        _count: { id: true },
        orderBy: { batchId: "desc" },
        take: 15,
      }),
      prisma.payout.findMany({
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, signature: true },
      }),
    ]);

    return NextResponse.json({
      cluster: CLUSTER,
      rpcHealthy,
      rpcLatencyMs,
      blockHeight,
      activeLaunchesCount,
      treasury: {
        configured: Boolean(treasuryWallet),
        wallet: treasuryWallet || null,
        platformFeeBps,
        platformFeePct: (platformFeeBps / 100).toFixed(2),
        balanceLamports: treasuryBalanceLamports,
      },
      config: {
        minPayoutLamports,
        sweepIntervalSeconds: 60,
        pinataConfigured: Boolean(process.env.PINATA_JWT),
        pumpApiConfigured: Boolean(process.env.PUMP_API_KEY),
      },
      lastSweepAt: recentPayouts[0]?.createdAt?.toISOString() || null,
      lastSweepSig: recentPayouts[0]?.signature || null,
      recentBatches: totalBatches.map((b) => ({
        batchId: b.batchId,
        recipientsCount: b._count.id,
        totalLamports: (b._sum.lamports ?? 0n).toString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/worker error:", error);
    return NextResponse.json(
      { error: "Failed to read worker telemetry" },
      { status: 500 }
    );
  }
}
