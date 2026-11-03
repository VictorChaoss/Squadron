import { NextResponse } from "next/server";
import { getSquadProvider } from "@/lib/squads";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") as "daily" | "weekly" | "monthly") || "weekly";

  try {
    const provider = await getSquadProvider();
    const trending = await provider.trending(period, 50);

    // Fetch local launch & fee stats per squad
    const dbSquads = await prisma.squad.findMany({
      include: {
        launches: {
          include: {
            payouts: {
              where: { status: "SENT" },
              select: { lamports: true },
            },
          },
        },
      },
    });

    const statsBySquad = new Map<
      string,
      { launchesCount: number; liveLaunchesCount: number; feesDistributedLamports: bigint }
    >();

    for (const s of dbSquads) {
      let fees = 0n;
      let liveCount = 0;
      for (const l of s.launches) {
        if (l.status === "LIVE") liveCount++;
        for (const p of l.payouts) {
          fees += p.lamports;
        }
      }
      statsBySquad.set(s.id, {
        launchesCount: s.launches.length,
        liveLaunchesCount: liveCount,
        feesDistributedLamports: fees,
      });
    }

    const enriched = trending.map((sq, idx) => {
      const local = statsBySquad.get(sq.id);
      const feesSol = local ? Number(local.feesDistributedLamports) / 1e9 : 0;
      const launchesCount = local?.launchesCount ?? 0;
      const liveLaunchesCount = local?.liveLaunchesCount ?? 0;
      // Rep Score combines PnL, launches, and fees distributed
      const repScore = Math.max(
        0,
        Math.round(
          (sq.pnlUsd ? Math.max(0, sq.pnlUsd) / 250 : 50) +
            launchesCount * 150 +
            feesSol * 500 +
            sq.memberCount * 8
        )
      );

      return {
        ...sq,
        rank: idx + 1,
        launchesCount,
        liveLaunchesCount,
        feesDistributedLamports: (local?.feesDistributedLamports ?? 0n).toString(),
        repScore,
      };
    });

    // Sort by repScore desc or keep PnL order if tied
    enriched.sort((a, b) => b.repScore - a.repScore || (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0));
    enriched.forEach((item, i) => {
      item.rank = i + 1;
    });

    return NextResponse.json({
      leaderboard: enriched,
      source: provider.name,
    });
  } catch (error) {
    console.error("Failed to load squad leaderboard:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
