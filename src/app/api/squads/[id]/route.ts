import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getSquadProvider, SquadRole } from "@/lib/squads";
import { prisma } from "@/lib/prisma";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing squad id" }, { status: 400 });
  }

  try {
    const provider = await getSquadProvider();
    const squad = await provider.getSquad(id);

    if (!squad) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    const existing = await prisma.squad.findUnique({
      where: { id: squad.id },
      include: { members: { where: { active: true } } },
    });

    if (!existing) {
      await prisma.squad.create({
        data: {
          id: squad.id,
          username: squad.username,
          profileImageUrl: squad.profileImageUrl,
          memberCount: squad.memberCount,
          syncedAt: new Date(),
          members: {
            create: squad.members
              .filter((m) => !!m.walletAddress)
              .map((m) => ({
                userId: m.userId,
                username: m.username,
                walletAddress: m.walletAddress!,
                role: m.role,
                active: true,
                syncedAt: new Date(),
              })),
          },
        },
      });
    } else if (!id.startsWith("custom-") && existing.members.length === 0) {
      await prisma.member.createMany({
        data: squad.members
          .filter((m) => !!m.walletAddress)
          .map((m) => ({
            squadId: squad.id,
            userId: m.userId,
            username: m.username,
            walletAddress: m.walletAddress!,
            role: m.role,
            active: true,
            syncedAt: new Date(),
          })),
      });
    }

    const launches = await prisma.launch.findMany({
      where: { squadId: squad.id },
      include: {
        vault: { select: { publicKey: true } },
        payouts: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        sweeps: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const conn = new Connection(RPC_URL, "confirmed");

    let totalSquadDistributed = 0n;
    const launchesFormatted = await Promise.all(
      launches.map(async (l) => {
        let vaultBalanceLamports = 0;
        try {
          vaultBalanceLamports = await conn.getBalance(new PublicKey(l.vault.publicKey));
        } catch {
          vaultBalanceLamports = 0;
        }
        const paid = l.payouts
          .filter((p) => p.status === "SENT")
          .reduce((acc, p) => acc + p.lamports, 0n);
        totalSquadDistributed += paid;

        return {
          ...l,
          vaultBalanceLamports,
          totalPaidLamports: paid.toString(),
          payouts: l.payouts.map((p) => ({
            ...p,
            lamports: p.lamports.toString(),
          })),
          sweeps: l.sweeps.map((s) => ({
            ...s,
            lamports: s.lamports.toString(),
          })),
        };
      })
    );

    return NextResponse.json({
      squad,
      launches: launchesFormatted,
      stats: {
        launchCount: launches.length,
        liveLaunchCount: launches.filter((l) => l.status === "LIVE").length,
        totalDistributedLamports: totalSquadDistributed.toString(),
      },
      source: provider.name,
    });
  } catch (error) {
    console.error(`Failed to get squad ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/squads/[id]
 * Adds or removes a wallet from a squad's active roster.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing squad id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const action = body.action as "add" | "remove";

    let dbSquad = await prisma.squad.findUnique({
      where: { id },
      include: { members: { where: { active: true } } },
    });

    if (!dbSquad) {
      const provider = await getSquadProvider();
      const upstream = await provider.getSquad(id);
      if (!upstream) {
        return NextResponse.json({ error: "Squad not found" }, { status: 404 });
      }
      dbSquad = await prisma.squad.create({
        data: {
          id: upstream.id,
          username: upstream.username,
          profileImageUrl: upstream.profileImageUrl,
          memberCount: upstream.memberCount,
          syncedAt: new Date(),
          members: {
            create: upstream.members
              .filter((m) => !!m.walletAddress)
              .map((m) => ({
                userId: m.userId,
                username: m.username,
                walletAddress: m.walletAddress!,
                role: m.role,
                active: true,
                syncedAt: new Date(),
              })),
          },
        },
        include: { members: { where: { active: true } } },
      });
    }

    if (action === "add") {
      const rawAddr = String(body.walletAddress || "").trim();
      let pubkey: PublicKey;
      try {
        pubkey = new PublicKey(rawAddr);
      } catch {
        return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
      }
      const base58 = pubkey.toBase58();
      const role: SquadRole =
        body.role && ["OWNER", "ADMIN", "MEMBER"].includes(body.role)
          ? body.role
          : "MEMBER";
      const username =
        String(body.username || "").trim().replace(/^@/, "") ||
        `${dbSquad.username}_${dbSquad.members.length + 1}`;
      const userId = `usr-${base58.slice(0, 8)}`;

      await prisma.member.upsert({
        where: {
          squadId_userId: {
            squadId: id,
            userId,
          },
        },
        create: {
          squadId: id,
          userId,
          username,
          walletAddress: base58,
          role,
          active: true,
          syncedAt: new Date(),
        },
        update: {
          username,
          walletAddress: base58,
          role,
          active: true,
          syncedAt: new Date(),
        },
      });
    } else if (action === "remove") {
      const walletToRemove = String(body.walletAddress || "").trim();
      await prisma.member.updateMany({
        where: {
          squadId: id,
          walletAddress: walletToRemove,
        },
        data: {
          active: false,
          syncedAt: new Date(),
        },
      });
    } else {
      return NextResponse.json({ error: "Invalid action; use 'add' or 'remove'" }, { status: 400 });
    }

    const activeCount = await prisma.member.count({
      where: { squadId: id, active: true },
    });

    await prisma.squad.update({
      where: { id },
      data: {
        memberCount: activeCount,
        syncedAt: new Date(),
      },
    });

    const provider = await getSquadProvider();
    const updatedSquad = await provider.getSquad(id);

    return NextResponse.json({ squad: updatedSquad });
  } catch (error) {
    console.error(`Failed to update squad ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update squad" },
      { status: 500 }
    );
  }
}
