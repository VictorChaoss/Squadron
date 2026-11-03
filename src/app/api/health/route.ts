import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSquadProvider } from "@/lib/squads";

export async function GET() {
  try {
    const provider = await getSquadProvider();
    const [squadCount, launchCount, vaultCount, payoutCount, lastSweep] = await Promise.all([
      prisma.squad.count(),
      prisma.launch.count({ where: { status: "LIVE" } }),
      prisma.vault.count(),
      prisma.payout.count({ where: { status: "SENT" } }),
      prisma.sweep.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);

    return NextResponse.json({
      status: "ONLINE",
      cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet",
      provider: provider.name,
      platformFeeBps: Number(process.env.PLATFORM_FEE_BPS || 0),
      platformTreasury:
        process.env.SQUADRON_TREASURY_WALLET || process.env.PLATFORM_TREASURY || null,
      counts: {
        cachedSquads: squadCount,
        liveLaunches: launchCount,
        splitterVaults: vaultCount,
        sentPayouts: payoutCount,
      },
      lastSweepAt: lastSweep?.createdAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "DEGRADED",
        error: error instanceof Error ? error.message : "Health check failed",
      },
      { status: 500 }
    );
  }
}
