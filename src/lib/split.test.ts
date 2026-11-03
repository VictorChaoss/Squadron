import { describe, expect, it } from "vitest";
import { buildShareholders, splitLamports } from "./split";

const r = (w: string, role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER") => ({ walletAddress: w, role });

describe("splitLamports", () => {
  it("splits equally and conserves total", () => {
    const out = splitLamports(1000n, [r("a"), r("b"), r("c")]);
    expect(out.reduce((s, a) => s + a.lamports, 0n)).toBe(1000n);
    expect(out.map((a) => a.lamports).sort()).toEqual([333n, 333n, 334n]);
  });
  it("handles 20 members (beyond on-chain 10 cap)", () => {
    const members = Array.from({ length: 20 }, (_, i) => r(`w${i}`));
    const out = splitLamports(1_000_000_007n, members);
    expect(out).toHaveLength(20);
    expect(out.reduce((s, a) => s + a.lamports, 0n)).toBe(1_000_000_007n);
  });
  it("applies role weights", () => {
    const out = splitLamports(400n, [r("o", "OWNER"), r("m", "MEMBER")], { OWNER: 3, ADMIN: 2, MEMBER: 1 });
    expect(out.find((a) => a.walletAddress === "o")!.lamports).toBe(300n);
  });
  it("merges duplicate wallets and skips zero weights", () => {
    const out = splitLamports(100n, [r("a"), r("a"), r("b", "ADMIN")], { OWNER: 1, ADMIN: 0, MEMBER: 1 });
    expect(out).toEqual([{ walletAddress: "a", role: "MEMBER", lamports: 100n }]);
  });
  it("returns empty for zero total", () => expect(splitLamports(0n, [r("a")])).toEqual([]));
});

describe("buildShareholders", () => {
  it("builds vault + creator", () => {
    expect(buildShareholders({ vault: "V", creator: "C", squadBps: 8000 })).toEqual([
      { address: "V", shareBps: 8000 },
      { address: "C", shareBps: 2000 },
    ]);
  });
  it("drops creator when squad takes 100%", () => {
    expect(buildShareholders({ vault: "V", creator: "C", squadBps: 10000 })).toHaveLength(1);
  });
  it("includes platform", () => {
    const s = buildShareholders({ vault: "V", creator: "C", squadBps: 7900, platformBps: 100, platformTreasury: "P" });
    expect(s.reduce((a, x) => a + x.shareBps, 0)).toBe(10000);
    expect(s).toHaveLength(3);
  });
  it("rejects invalid split", () => {
    expect(() => buildShareholders({ vault: "V", creator: "C", squadBps: 0 })).toThrow();
    expect(() => buildShareholders({ vault: "V", creator: "C", squadBps: 10001 })).toThrow();
  });
});
