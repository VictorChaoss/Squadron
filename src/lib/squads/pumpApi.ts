import "server-only";
import type { SquadDetail, SquadMember, SquadProvider, SquadRole, SquadSummary } from "./types";

/**
 * Real provider backed by the official pump.fun Developer API
 * (https://docs.pump.fun). Server-side only: the API revokes keys seen with a
 * browser Origin. Uses plain fetch against the documented /v1 contract
 * (shapes taken from https://docs.pump.fun/openapi.public.json).
 */
export class PumpApiSquadProvider implements SquadProvider {
  readonly name = "pump.fun";
  constructor(
    private apiKey: string,
    private baseUrl = "https://api.pump.fun/v1",
  ) {}

  private async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        const wait = Number(res.headers.get("retry-after") ?? 5);
        await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
        continue;
      }
      const body = await res.text();
      throw new PumpApiError(res.status, body, res.headers.get("x-request-id"));
    }
  }

  async search(term: string, limit = 20): Promise<SquadSummary[]> {
    if (term.trim().length < 2) return [];
    // No group-only search exists; search users and keep kind === "group".
    const rows = await this.get<SearchRow[]>("/users/search-v2", { searchTerm: term.trim(), limit: 50 });
    return rows
      .filter((r) => r.kind === "group")
      .slice(0, limit)
      .map((r) => ({
        id: r.userId,
        username: r.username ?? r.userId,
        profileImageUrl: r.profile_image ?? null,
        memberCount: r.member_count ?? 0,
      }));
  }

  async trending(period: "daily" | "weekly" | "monthly" = "weekly", limit = 50): Promise<SquadSummary[]> {
    const data = await this.get<{ entries: LeaderboardRow[] }>("/pnl-leaderboard/groups", {
      period,
      limit,
      positionsLimit: 0,
    });
    return data.entries.map((e) => ({
      id: e.groupId,
      username: e.username ?? e.groupId,
      profileImageUrl: e.profileImageUrl ?? null,
      memberCount: e.memberCount ?? 0,
      isVerified: e.isVerified,
      pnlUsd: e.pnlUsd,
      rank: e.rank,
    }));
  }

  async getSquad(id: string): Promise<SquadDetail | null> {
    let user: UserRow;
    try {
      user = await this.get<UserRow>(`/users/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof PumpApiError && e.status === 404) return null;
      throw e;
    }
    if (user.kind !== "group") return null;

    const members: SquadMember[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await this.get<MembersPage>(`/groups/${encodeURIComponent(user.userId)}/members`, {
        status: "ACTIVE",
        limit: 200,
        offset,
      });
      for (const m of page.members) {
        if (!m.profile) continue;
        members.push({
          userId: m.profile.userId,
          username: m.profile.username ?? null,
          profileImageUrl: m.profile.profileImageUrl ?? null,
          walletAddress: m.profile.walletAddress ?? null,
          role: normalizeRole(m.role),
          isPumpUser: m.profile.isPumpUser ?? true,
        });
      }
      if (!page.hasMore || page.members.length === 0) break;
    }

    // Fill missing wallets via batch profile lookup (canonical SVM wallet).
    const missing = members.filter((m) => !m.walletAddress);
    if (missing.length) {
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const rows = await this.post<UserRow[]>("/users/batch", { addresses: chunk.map((m) => m.userId) });
        const byId = new Map(rows.map((r) => [r.userId, r]));
        for (const m of chunk) m.walletAddress = byId.get(m.userId)?.canonical_svm_wallet ?? null;
      }
    }

    return {
      id: user.userId,
      username: user.username ?? user.userId,
      profileImageUrl: user.profile_image ?? null,
      memberCount: user.member_count ?? members.length,
      members,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new PumpApiError(res.status, await res.text(), res.headers.get("x-request-id"));
    return (await res.json()) as T;
  }
}

export class PumpApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public requestId: string | null,
  ) {
    super(`pump.fun API ${status}: ${body.slice(0, 200)}`);
  }
}

function normalizeRole(r: string | undefined): SquadRole {
  return r === "OWNER" || r === "ADMIN" ? r : "MEMBER";
}

interface SearchRow {
  userId: string;
  address: string;
  username: string | null;
  profile_image: string | null;
  kind: "person" | "group";
  member_count?: number;
}
type UserRow = SearchRow & { canonical_svm_wallet?: string | null };
interface LeaderboardRow {
  rank: number;
  groupId: string;
  username: string | null;
  profileImageUrl: string | null;
  memberCount: number;
  isVerified: boolean;
  pnlUsd: number;
}
interface MembersPage {
  members: {
    profile: {
      userId: string;
      username: string | null;
      profileImageUrl: string | null;
      walletAddress: string | null;
      isPumpUser?: boolean;
    } | null;
    role: string;
    status: string;
  }[];
  hasMore: boolean;
}
