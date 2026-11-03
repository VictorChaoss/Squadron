import { Keypair } from "@solana/web3.js";
import { createHash } from "crypto";
import type { SquadDetail, SquadMember, SquadProvider, SquadRole, SquadSummary } from "./types";

/**
 * Deterministic mock squads for development until a pump.fun API key is
 * approved. Wallets are valid ed25519 pubkeys derived from a seed, so they
 * work on devnet (e.g. for testing payouts).
 */
const NAMES = [
  "degen-council", "alpha-hunters", "sol-sniperz", "moon-mafia", "trench-wolves",
  "bonk-brigade", "pump-pirates", "night-shift", "chart-wizards", "rug-survivors",
  "jeet-proof", "based-collective",
];

function seeded(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function makeSquad(i: number): SquadDetail {
  const id = `mock-${seeded(NAMES[i]).toString("hex").slice(0, 16)}`;
  const count = 3 + (seeded(id)[0] % 18); // 3..20 members — exercises the >10 case
  const members: SquadMember[] = Array.from({ length: count }, (_, j) => {
    const kp = Keypair.fromSeed(seeded(`${id}:${j}`));
    const role: SquadRole = j === 0 ? "OWNER" : j < 3 ? "ADMIN" : "MEMBER";
    return {
      userId: `${id}-u${j}`,
      username: `${NAMES[i].split("-")[0]}_${j}`,
      profileImageUrl: null,
      walletAddress: kp.publicKey.toBase58(),
      role,
      isPumpUser: true,
    };
  });
  return {
    id,
    username: NAMES[i],
    profileImageUrl: null,
    memberCount: count,
    isVerified: i % 4 === 0,
    pnlUsd: Math.round((seeded(id)[1] - 60) * 1234.5),
    rank: i + 1,
    members,
  };
}

const SQUADS = NAMES.map((_, i) => makeSquad(i));
const summary = (s: SquadDetail): SquadSummary => {
  const { members: _, ...rest } = s;
  return rest;
};

export class MockSquadProvider implements SquadProvider {
  readonly name = "mock";
  async search(term: string, limit = 20) {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    return SQUADS.filter((s) => s.username.includes(t)).slice(0, limit).map(summary);
  }
  async trending(_period?: string, limit = 50) {
    return [...SQUADS].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)).slice(0, limit).map(summary);
  }
  async getSquad(id: string) {
    return SQUADS.find((s) => s.id === id || s.username === id) ?? null;
  }
}
