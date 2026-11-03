import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getSquadProvider, SquadRole } from "@/lib/squads";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const period = (searchParams.get("period") as "daily" | "weekly" | "monthly") || "weekly";
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  try {
    const provider = await getSquadProvider();
    if (q && q.trim().length >= 2) {
      const results = await provider.search(q, limit);
      return NextResponse.json({ squads: results, source: provider.name });
    }
    const trending = await provider.trending(period, limit);
    return NextResponse.json({ squads: trending, source: provider.name });
  } catch (error) {
    console.error("Failed to query squads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

interface CreateSquadMemberInput {
  username?: string;
  walletAddress: string;
  role?: SquadRole;
}

/**
 * POST /api/squads
 * Registers or imports a custom Pump.fun Squad with 1–20 Solana member wallets.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawUsername = String(body.username || "")
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();

    if (!rawUsername || rawUsername.length < 2) {
      return NextResponse.json(
        { error: "Squad username must be at least 2 characters (letters, numbers, _ or -)." },
        { status: 400 }
      );
    }

    const rawMembers: CreateSquadMemberInput[] = Array.isArray(body.members) ? body.members : [];
    if (rawMembers.length === 0) {
      return NextResponse.json(
        { error: "Provide at least 1 squad member Solana wallet address." },
        { status: 400 }
      );
    }
    if (rawMembers.length > 25) {
      return NextResponse.json(
        { error: "Maximum 25 member wallets per squad." },
        { status: 400 }
      );
    }

    const validatedMembers: {
      userId: string;
      username: string;
      walletAddress: string;
      role: SquadRole;
    }[] = [];

    const seenWallets = new Set<string>();
    for (let i = 0; i < rawMembers.length; i++) {
      const item = rawMembers[i];
      const addr = String(item.walletAddress || "").trim();
      if (!addr) continue;

      let pubkey: PublicKey;
      try {
        pubkey = new PublicKey(addr);
      } catch {
        return NextResponse.json(
          { error: `Invalid Solana wallet address at row #${i + 1}: "${addr}"` },
          { status: 400 }
        );
      }

      const base58 = pubkey.toBase58();
      if (seenWallets.has(base58)) continue;
      seenWallets.add(base58);

      const role: SquadRole =
        item.role && ["OWNER", "ADMIN", "MEMBER"].includes(item.role)
          ? item.role
          : i === 0
          ? "OWNER"
          : "MEMBER";

      const handle =
        String(item.username || "").trim().replace(/^@/, "") ||
        `${rawUsername}_${i + 1}`;

      validatedMembers.push({
        userId: `usr-${base58.slice(0, 8)}`,
        username: handle,
        walletAddress: base58,
        role,
      });
    }

    if (validatedMembers.length === 0) {
      return NextResponse.json(
        { error: "No valid Solana wallet addresses provided." },
        { status: 400 }
      );
    }

    const squadId = body.groupId
      ? String(body.groupId).trim()
      : `custom-${rawUsername}`;

    const profileImageUrl = body.profileImageUrl ? String(body.profileImageUrl).trim() : null;

    const saved = await prisma.$transaction(async (tx) => {
      await tx.member.deleteMany({ where: { squadId } });
      return tx.squad.upsert({
        where: { id: squadId },
        create: {
          id: squadId,
          username: rawUsername,
          profileImageUrl,
          memberCount: validatedMembers.length,
          syncedAt: new Date(),
          members: {
            create: validatedMembers.map((m) => ({
              userId: m.userId,
              username: m.username,
              walletAddress: m.walletAddress,
              role: m.role,
              active: true,
              syncedAt: new Date(),
            })),
          },
        },
        update: {
          username: rawUsername,
          profileImageUrl,
          memberCount: validatedMembers.length,
          syncedAt: new Date(),
          members: {
            create: validatedMembers.map((m) => ({
              userId: m.userId,
              username: m.username,
              walletAddress: m.walletAddress,
              role: m.role,
              active: true,
              syncedAt: new Date(),
            })),
          },
        },
        include: {
          members: { where: { active: true } },
        },
      });
    });

    return NextResponse.json({
      squad: {
        id: saved.id,
        username: saved.username,
        profileImageUrl: saved.profileImageUrl,
        memberCount: saved.members.length,
        isVerified: true,
        members: saved.members.map((m) => ({
          userId: m.userId,
          username: m.username,
          profileImageUrl: null,
          walletAddress: m.walletAddress,
          role: m.role as SquadRole,
          isPumpUser: true,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to create/import squad:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save squad" },
      { status: 500 }
    );
  }
}
