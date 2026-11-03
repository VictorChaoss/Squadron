import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const squadId = searchParams.get("squadId");
  const status = searchParams.get("status");

  try {
    const launches = await prisma.launch.findMany({
      where: {
        ...(squadId ? { squadId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        squad: {
          include: {
            _count: { select: { members: true } },
          },
        },
        vault: { select: { publicKey: true } },
        payouts: {
          select: { lamports: true, status: true },
        },
        _count: { select: { payouts: true, sweeps: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    const formatted = launches.map((l) => {
      const totalDistributedLamports = l.payouts
        .filter((p) => p.status === "SENT")
        .reduce((acc, p) => acc + p.lamports, 0n);

      const { payouts: _, ...rest } = l;
      return {
        ...rest,
        totalDistributedLamports: totalDistributedLamports.toString(),
      };
    });

    return NextResponse.json({ launches: formatted });
  } catch (error) {
    console.error("Failed to list launches:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
