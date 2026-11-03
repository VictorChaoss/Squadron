import type { SquadRole } from "./squads/types";

/** Role weights used when splitting the squad vault across members. Equal by default. */
export type RoleWeights = Record<SquadRole, number>;
export const EQUAL_WEIGHTS: RoleWeights = { OWNER: 1, ADMIN: 1, MEMBER: 1 };

export interface Recipient {
  walletAddress: string;
  role: SquadRole;
  userId?: string;
}

export interface Allocation extends Recipient {
  lamports: bigint;
}

/**
 * Split `total` lamports across recipients pro-rata by role weight.
 * Integer math only; dust left by flooring goes to the highest-weighted
 * recipients (first in order) so the sum always equals `total`.
 * Duplicate wallets are merged.
 */
export function splitLamports(
  total: bigint,
  recipients: Recipient[],
  weights: RoleWeights = EQUAL_WEIGHTS,
): Allocation[] {
  if (total <= 0n || recipients.length === 0) return [];

  const merged = new Map<string, { r: Recipient; w: bigint }>();
  for (const r of recipients) {
    const w = BigInt(Math.round((weights[r.role] ?? 0) * 1000));
    if (w <= 0n) continue;
    const prev = merged.get(r.walletAddress);
    if (prev) prev.w += w;
    else merged.set(r.walletAddress, { r, w });
  }
  const entries = [...merged.values()].sort((a, b) => (b.w > a.w ? 1 : b.w < a.w ? -1 : 0));
  const totalW = entries.reduce((s, e) => s + e.w, 0n);
  if (totalW === 0n) return [];

  const out: Allocation[] = entries.map(({ r, w }) => ({ ...r, lamports: (total * w) / totalW }));
  let dust = total - out.reduce((s, a) => s + a.lamports, 0n);
  for (let i = 0; dust > 0n; i = (i + 1) % out.length, dust--) out[i].lamports += 1n;
  return out;
}

/**
 * On-chain fee-sharing shareholders for a launch. PumpFees requires
 * 1..10 entries, unique addresses, each > 0 bps, summing to exactly 10_000.
 */
export function buildShareholders(opts: {
  vault: string;
  creator: string;
  squadBps: number;
  platformBps?: number;
  platformTreasury?: string;
}): { address: string; shareBps: number }[] {
  const platformBps = opts.platformTreasury ? opts.platformBps ?? 0 : 0;
  const creatorBps = 10_000 - opts.squadBps - platformBps;
  if (opts.squadBps <= 0 || creatorBps < 0) throw new Error("Invalid split: squad + platform must be in (0, 10000]");

  const list = [
    { address: opts.vault, shareBps: opts.squadBps },
    { address: opts.creator, shareBps: creatorBps },
    { address: opts.platformTreasury ?? "", shareBps: platformBps },
  ].filter((s) => s.shareBps > 0 && s.address);

  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.address)) throw new Error(`Duplicate shareholder ${s.address}`);
    seen.add(s.address);
  }
  if (list.reduce((a, s) => a + s.shareBps, 0) !== 10_000) throw new Error("Shares must sum to 10000 bps");
  return list;
}
