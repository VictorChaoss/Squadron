export type SquadRole = "OWNER" | "ADMIN" | "MEMBER";

export interface SquadSummary {
  id: string; // pump.fun groupId
  username: string;
  profileImageUrl: string | null;
  memberCount: number;
  isVerified?: boolean;
  /** Present when sourced from the squad PnL leaderboard. */
  pnlUsd?: number;
  rank?: number;
}

export interface SquadMember {
  userId: string;
  username: string | null;
  profileImageUrl: string | null;
  walletAddress: string | null;
  role: SquadRole;
  isPumpUser: boolean;
}

export interface SquadDetail extends SquadSummary {
  members: SquadMember[];
}

export interface SquadProvider {
  readonly name: string;
  search(term: string, limit?: number): Promise<SquadSummary[]>;
  trending(period?: "daily" | "weekly" | "monthly", limit?: number): Promise<SquadSummary[]>;
  getSquad(id: string): Promise<SquadDetail | null>;
}
