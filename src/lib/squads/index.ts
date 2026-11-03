import { prisma } from "@/lib/prisma";
import { MockSquadProvider } from "./mock";
import type { SquadDetail, SquadMember, SquadProvider, SquadRole, SquadSummary } from "./types";

function mapDbSquadToDetail(dbSquad: {
  id: string;
  username: string;
  profileImageUrl: string | null;
  memberCount: number;
  members: {
    userId: string;
    username: string | null;
    walletAddress: string;
    role: string;
    active: boolean;
  }[];
}): SquadDetail {
  const activeMembers = dbSquad.members.filter((m) => m.active);
  const members: SquadMember[] = activeMembers.map((m) => ({
    userId: m.userId,
    username: m.username,
    profileImageUrl: null,
    walletAddress: m.walletAddress,
    role: (["OWNER", "ADMIN", "MEMBER"].includes(m.role) ? m.role : "MEMBER") as SquadRole,
    isPumpUser: true,
  }));

  return {
    id: dbSquad.id,
    username: dbSquad.username,
    profileImageUrl: dbSquad.profileImageUrl,
    memberCount: members.length || dbSquad.memberCount,
    isVerified: true,
    members,
  };
}

class HybridSquadProvider implements SquadProvider {
  readonly name: string;
  private upstream: SquadProvider;
  private fallback: MockSquadProvider;

  constructor(upstream: SquadProvider) {
    this.upstream = upstream;
    this.fallback = new MockSquadProvider();
    this.name = `${upstream.name}+custom`;
  }

  async search(term: string, limit = 20): Promise<SquadSummary[]> {
    const q = term.trim().toLowerCase().replace(/^@/, "");
    const dbSquads = await prisma.squad.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { id: { contains: q } },
        ],
      },
      include: {
        members: { where: { active: true } },
      },
      orderBy: { syncedAt: "desc" },
      take: limit,
    });

    const customSummaries: SquadSummary[] = dbSquads.map((s) => ({
      id: s.id,
      username: s.username,
      profileImageUrl: s.profileImageUrl,
      memberCount: s.members.length || s.memberCount,
      isVerified: true,
    }));

    let upstreamResults: SquadSummary[] = [];
    try {
      upstreamResults = await this.upstream.search(term, limit);
    } catch {
      upstreamResults = await this.fallback.search(term, limit);
    }

    const seen = new Set(customSummaries.map((s) => s.id));
    for (const item of upstreamResults) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        customSummaries.push(item);
      }
    }

    return customSummaries.slice(0, limit);
  }

  async trending(
    period: "daily" | "weekly" | "monthly" = "weekly",
    limit = 20
  ): Promise<SquadSummary[]> {
    const dbSquads = await prisma.squad.findMany({
      include: {
        members: { where: { active: true } },
      },
      orderBy: { syncedAt: "desc" },
      take: limit,
    });

    const byId = new Map<string, SquadSummary>();
    for (const s of dbSquads) {
      byId.set(s.id, {
        id: s.id,
        username: s.username,
        profileImageUrl: s.profileImageUrl,
        memberCount: s.members.length || s.memberCount,
        isVerified: true,
      });
    }

    let upstreamList: SquadSummary[] = [];
    try {
      upstreamList = await this.upstream.trending(period, limit);
    } catch {
      upstreamList = await this.fallback.trending(period, limit);
    }

    const merged: SquadSummary[] = [];
    const seen = new Set<string>();

    // First include custom-created squads (`custom-*`) at the top so user-created squads appear immediately
    for (const s of byId.values()) {
      if (s.id.startsWith("custom-")) {
        seen.add(s.id);
        merged.push(s);
      }
    }

    // Next merge upstream squads, overriding memberCount/username if customized in DB
    for (const item of upstreamList) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const local = byId.get(item.id);
      merged.push(
        local
          ? {
              ...item,
              username: local.username,
              profileImageUrl: local.profileImageUrl || item.profileImageUrl,
              memberCount: local.memberCount,
            }
          : item
      );
    }

    return merged.slice(0, limit);
  }

  async getSquad(id: string): Promise<SquadDetail | null> {
    // 1. If it's a custom squad or already exists in DB with active members, check DB first
    const dbSquad = await prisma.squad.findUnique({
      where: { id },
      include: {
        members: {
          where: { active: true },
          orderBy: { id: "asc" },
        },
      },
    });

    if (dbSquad && (id.startsWith("custom-") || dbSquad.members.length > 0)) {
      let upstreamMeta: SquadDetail | null = null;
      if (!id.startsWith("custom-")) {
        try {
          upstreamMeta = await this.upstream.getSquad(id);
        } catch {
          upstreamMeta = await this.fallback.getSquad(id);
        }
      }
      const mapped = mapDbSquadToDetail(dbSquad);
      return {
        ...mapped,
        pnlUsd: upstreamMeta?.pnlUsd,
        rank: upstreamMeta?.rank,
      };
    }

    // 2. Otherwise query upstream provider (with fallback)
    try {
      return await this.upstream.getSquad(id);
    } catch {
      return await this.fallback.getSquad(id);
    }
  }
}

let provider: SquadProvider | undefined;

/** Uses the real pump.fun API when PUMP_API_KEY is set, otherwise mock data, wrapped with DB custom squads. */
export async function getSquadProvider(): Promise<SquadProvider> {
  if (provider) return provider;
  const key = process.env.PUMP_API_KEY;
  let upstream: SquadProvider;
  if (key && process.env.SQUAD_PROVIDER !== "mock") {
    const { PumpApiSquadProvider } = await import("./pumpApi");
    upstream = new PumpApiSquadProvider(key, process.env.PUMP_API_BASE_URL || undefined);
  } else {
    upstream = new MockSquadProvider();
  }
  provider = new HybridSquadProvider(upstream);
  return provider;
}

export * from "./types";
