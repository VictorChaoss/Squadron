"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  PumpCapsuleIcon,
  RosterSlotBar,
  PillSplitMeter,
} from "@/components/SquadronPrimitives";
import { SquadDetail, SquadRole } from "@/lib/squads/types";

interface SquadLaunchRow {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string | null;
  squadBps: number;
  creatorBps: number;
  status: string;
  createdAt: string;
  vault: { publicKey: string };
  vaultBalanceLamports: number;
  totalPaidLamports: string;
  payouts?: {
    id: string;
    batchId: string;
    walletAddress: string;
    lamports: string;
    signature: string | null;
    createdAt: string;
  }[];
}

function formatSol(val: string | number | bigint): string {
  const n = Number(val) / 1e9;
  if (n === 0) return "0.00";
  if (n < 0.001) return n.toFixed(5);
  return n.toFixed(3);
}

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
function solscanUrl(type: "account" | "tx" | "token", value: string) {
  const suffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://solscan.io/${type}/${value}${suffix}`;
}

export default function SquadProfilePage() {
  const params = useParams<{ id: string }>();
  const { publicKey } = useWallet();

  const [squad, setSquad] = useState<SquadDetail | null>(null);
  const [launches, setLaunches] = useState<SquadLaunchRow[]>([]);
  const [stats, setStats] = useState<{
    launchCount: number;
    liveLaunchCount: number;
    totalDistributedLamports: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  // Add Member Form State
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberHandle, setNewMemberHandle] = useState("");
  const [newMemberWallet, setNewMemberWallet] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<SquadRole>("MEMBER");
  const [updatingRoster, setUpdatingRoster] = useState(false);

  const loadSquad = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/squads/${encodeURIComponent(params.id)}`);
      const data = await res.json();
      if (data.squad) {
        setSquad(data.squad);
        setLaunches(data.launches || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("Failed to fetch squad profile:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    loadSquad();
  }, [loadSquad]);

  const handleCopy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedWallet(addr);
    setTimeout(() => setCopiedWallet(null), 1500);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!squad || !newMemberWallet.trim()) return;
    setUpdatingRoster(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/squads/${encodeURIComponent(squad.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          username: newMemberHandle.trim(),
          walletAddress: newMemberWallet.trim(),
          role: newMemberRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add member");
      setSquad(data.squad);
      setNewMemberHandle("");
      setNewMemberWallet("");
      setShowAddMember(false);
      setNotice("ADDED WALLET TO ACTIVE SQUAD ROSTER");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to update roster");
    } finally {
      setUpdatingRoster(false);
    }
  };

  const handleRemoveMember = async (walletAddress: string) => {
    if (!squad) return;
    setUpdatingRoster(true);
    try {
      const res = await fetch(`/api/squads/${encodeURIComponent(squad.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          walletAddress,
        }),
      });
      const data = await res.json();
      if (res.ok && data.squad) {
        setSquad(data.squad);
        setNotice(`REMOVED ${walletAddress.slice(0, 6)}... FROM ACTIVE ROSTER`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setUpdatingRoster(false);
    }
  };

  const handleSweep = async (launchId: string) => {
    setSweepingId(launchId);
    setNotice(null);
    try {
      const res = await fetch(`/api/launches/${launchId}/sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerWallet: publicKey?.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sweep failed");

      if (data.splitExecuted) {
        setNotice(
          `DISTRIBUTED ${formatSol(data.distributedLamports)}◎ TO ${data.recipientsCount} WALLETS (TX: ${data.splitTxSignature?.slice(0, 8)}...)`
        );
      } else {
        setNotice(
          `ROSTER SYNCED (${data.memberCount} ACTIVE WALLETS) · VAULT ${formatSol(data.vaultBalanceLamports)}◎`
        );
      }
      loadSquad();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setSweepingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0c051a] text-[#ffffff]">
      <Navbar />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between border-b-2 border-[#311b63] pb-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#a99bc9] hover:text-[#d8ff00]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>BACK TO SQUAD BOARD</span>
          </Link>
          {squad && (
            <span className="text-xs font-mono text-[#6a5991]">
              SQUAD_ID: {squad.id}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-12 hangar-card text-center text-xs font-mono text-[#a99bc9]">
            LOADING SQUAD ROSTER & SPLITTER VAULT TELEMETRY...
          </div>
        ) : !squad ? (
          <div className="p-12 hangar-card text-center text-sm font-bold text-white">
            Squad not found.
          </div>
        ) : (
          <>
            {/* Squadron Header Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 hangar-card overflow-hidden">
              <div className="lg:col-span-7 p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-[#311b63] bg-gradient-to-br from-[#230e4d] via-[#15082e] to-[#0f0622] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="squad-badge bg-[#261252] border border-[#5229b5] px-2.5 py-1 text-[10px] font-mono text-[#d8ff00]">
                        <span>SQUAD PROFILE</span>
                      </span>
                      <h1 className="squad-title text-2xl sm:text-3xl text-white flex items-center gap-2">
                        <span>@{squad.username}</span>
                        {squad.isVerified && (
                          <CheckCircle2 className="w-5 h-5 text-[#24e063] shrink-0" />
                        )}
                      </h1>
                    </div>
                    <p className="text-xs font-mono text-[#a99bc9]">
                      {squad.members.length} Active Wallets Ready for Pro-Rata Fee Splitting
                      {squad.members.length > 10 &&
                        " · 20-Slot Splitter Vault Overdrive Active"}
                    </p>
                  </div>

                  <Link
                    href={`/?tab=launch&squadId=${encodeURIComponent(squad.id)}`}
                    className="btn-volt h-10 px-4 text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>LAUNCH COIN FOR @{squad.username}</span>
                  </Link>
                </div>

                {/* 20-Slot Roster Meter */}
                <div className="pt-2 border-t border-[#311b63] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#a99bc9]">
                      ROSTER CAPACITY (GREEN = NATIVE 10 CAP · VOLT = SPLITTER OVERDRIVE)
                    </span>
                    <span className="text-[#d8ff00] font-bold">
                      {squad.members.length} / 20 SLOTS
                    </span>
                  </div>
                  <RosterSlotBar memberCount={squad.members.length} />
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-3 divide-x-2 divide-[#311b63] font-mono bg-[#0c051a]">
                <div className="p-5 flex flex-col justify-between">
                  <span className="text-[10px] text-[#6a5991] block">ACTIVE WALLETS</span>
                  <span className="squad-title text-3xl text-white mt-2 block">
                    {squad.members.filter((m) => !!m.walletAddress).length}
                  </span>
                  <span className="text-[10px] text-[#24e063] mt-1">AUTO-RESOLVED</span>
                </div>
                <div className="p-5 flex flex-col justify-between">
                  <span className="text-[10px] text-[#6a5991] block">COINS LAUNCHED</span>
                  <span className="squad-title text-3xl text-[#d8ff00] mt-2 block">
                    {stats?.launchCount ?? 0}
                  </span>
                  <span className="text-[10px] text-[#a99bc9] mt-1">PUMP.FUN V2</span>
                </div>
                <div className="p-5 flex flex-col justify-between">
                  <span className="text-[10px] text-[#6a5991] block">FEES ROUTED</span>
                  <span className="squad-title text-3xl text-[#24e063] mt-2 block">
                    {formatSol(stats?.totalDistributedLamports ?? "0")}◎
                  </span>
                  <span className="text-[10px] text-[#a99bc9] mt-1">PRO-RATA PAID</span>
                </div>
              </div>
            </div>

            {notice && (
              <div className="p-3.5 border-2 border-[#d8ff00] bg-[#1e0d42] text-xs font-mono text-[#d8ff00] flex items-center gap-2">
                <PumpCapsuleIcon className="w-5 h-3" />
                <span>{notice}</span>
              </div>
            )}

            {/* Main 12-Col Split: Roster Table Left / Squad Launches Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 hangar-card overflow-hidden">
              {/* Left 5 Cols: Active Roster + Roster Manager */}
              <div className="lg:col-span-5 border-b-2 lg:border-b-0 lg:border-r-2 border-[#311b63]">
                <div className="px-4 py-3 border-b-2 border-[#311b63] bg-[#0c051a] flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-white flex items-center gap-2">
                    <PumpCapsuleIcon className="w-4 h-2.5" />
                    <span>SQUAD ROSTER ({squad.members.length} WALLETS)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="btn-hangar px-2.5 py-1 text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 text-[#d8ff00]" />
                    <span>{showAddMember ? "Close" : "+ Add Wallet"}</span>
                  </button>
                </div>

                {showAddMember && (
                  <form
                    onSubmit={handleAddMember}
                    className="p-3.5 bg-[#15082e] border-b-2 border-[#311b63] space-y-2.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#d8ff00] font-bold">
                        ADD MEMBER WALLET TO @{squad.username}
                      </span>
                      {publicKey && (
                        <button
                          type="button"
                          onClick={() => setNewMemberWallet(publicKey.toBase58())}
                          className="text-[10px] text-[#24e063] hover:underline cursor-pointer"
                        >
                          Use My Wallet
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        placeholder="Handle"
                        value={newMemberHandle}
                        onChange={(e) => setNewMemberHandle(e.target.value)}
                        className="col-span-4 h-8 px-2 bg-[#0c051a] border border-[#311b63] text-xs text-white focus:outline-none focus:border-[#d8ff00]"
                      />
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as SquadRole)}
                        className="col-span-4 h-8 px-2 bg-[#0c051a] border border-[#311b63] text-[10px] text-[#d8ff00] font-bold focus:outline-none"
                      >
                        <option value="MEMBER">MEMBER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="OWNER">OWNER</option>
                      </select>
                      <button
                        type="submit"
                        disabled={updatingRoster}
                        className="col-span-4 btn-volt h-8 text-[10px] cursor-pointer"
                      >
                        {updatingRoster ? "SAVING..." : "ADD WALLET"}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Solana Wallet Address (base58)..."
                      value={newMemberWallet}
                      onChange={(e) => setNewMemberWallet(e.target.value)}
                      required
                      className="w-full h-8 px-2 bg-[#0c051a] border border-[#311b63] text-xs text-white focus:outline-none focus:border-[#d8ff00]"
                    />
                  </form>
                )}

                <div className="max-h-[560px] overflow-y-auto divide-y divide-[#311b63] font-mono text-xs">
                  {squad.members.map((m, idx) => {
                    const isOverdrive = idx >= 10;
                    return (
                      <div
                        key={m.userId || idx}
                        className="px-4 py-3 flex items-center justify-between hover:bg-[#1a0b38] transition-colors gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 font-bold ${
                                isOverdrive
                                  ? "bg-[#d8ff00] text-[#090314]"
                                  : "bg-[#24e063] text-[#090314]"
                              }`}
                            >
                              #{String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="font-sans font-extrabold text-white truncate">
                              {m.username || `Member ${idx + 1}`}
                            </span>
                            <span className="px-1.5 py-0.5 bg-[#200e45] border border-[#3e227a] text-[10px] text-[#d8ff00]">
                              {m.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6a5991] truncate mt-1">
                            {m.walletAddress || "NO_WALLET"}
                          </div>
                        </div>

                        {m.walletAddress && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopy(m.walletAddress!)}
                              className="btn-hangar px-2 py-1 text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              <span>
                                {copiedWallet === m.walletAddress ? "COPIED" : "COPY"}
                              </span>
                            </button>
                            <a
                              href={solscanUrl("account", m.walletAddress)}
                              target="_blank"
                              rel="noreferrer"
                              title="View on Solscan"
                              className="btn-hangar p-1 text-[#a99bc9] hover:text-[#d8ff00]"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            {squad.members.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.walletAddress!)}
                                disabled={updatingRoster}
                                title="Remove from roster"
                                className="btn-hangar p-1 text-[#a99bc9] hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right 7 Cols: Squad Launches & Splitter Vaults */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="px-4 py-3 border-b-2 border-[#311b63] bg-[#0c051a] flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-white">
                    SQUAD LAUNCHES & SPLITTER VAULTS
                  </span>
                  <span className="text-[10px] text-[#d8ff00] font-bold">
                    {launches.length} COINS DEPLOYED
                  </span>
                </div>

                {launches.length === 0 ? (
                  <div className="p-12 text-center space-y-3 my-auto">
                    <PumpCapsuleIcon className="w-8 h-5 mx-auto" />
                    <div className="squad-title text-base text-white">
                      0 COINS LAUNCHED FOR @{squad.username}
                    </div>
                    <p className="text-xs font-mono text-[#a99bc9] max-w-sm mx-auto">
                      Deploy the first Pump.fun coin designating @{squad.username} to initialize its dedicated on-chain Splitter Vault.
                    </p>
                    <div className="pt-2">
                      <Link
                        href={`/?tab=launch&squadId=${encodeURIComponent(squad.id)}`}
                        className="btn-volt inline-flex items-center gap-1.5 px-5 py-2.5 text-xs"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>LAUNCH COIN FOR @{squad.username}</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y-2 divide-[#311b63]">
                    {launches.map((l) => (
                      <div
                        key={l.id}
                        className="p-5 space-y-4 hover:bg-[#190a36] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={l.imageUrl || "/branding/final-logo.png"}
                              alt={l.name}
                              className="w-12 h-12 rounded-[3px] object-cover border-2 border-[#4d2999]"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/launches/${encodeURIComponent(l.id)}`}
                                  className="squad-title text-base text-white hover:text-[#d8ff00]"
                                >
                                  {l.name}
                                </Link>
                                <span className="squad-badge px-2 py-0.5 bg-[#d8ff00] text-[#090314] font-mono text-[11px] font-bold">
                                  <span>${l.symbol}</span>
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-[#6a5991] mt-0.5 flex items-center gap-2">
                                <span>MINT: {l.mint.slice(0, 8)}...{l.mint.slice(-6)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(l.mint)}
                                  className="text-[#a99bc9] hover:text-[#d8ff00] cursor-pointer"
                                >
                                  {copiedWallet === l.mint ? "COPIED" : "COPY"}
                                </button>
                                <a
                                  href={solscanUrl("account", l.mint)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#24e063] hover:underline inline-flex items-center gap-0.5"
                                >
                                  <span>SOLSCAN</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSweep(l.id)}
                              disabled={sweepingId === l.id}
                              className="btn-volt px-3.5 py-2 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>
                                {sweepingId === l.id ? "SYNCING..." : "SWEEP & SPLIT"}
                              </span>
                            </button>
                            <Link
                              href={`/launches/${encodeURIComponent(l.id)}`}
                              className="btn-hangar px-3 py-2 text-xs font-mono"
                            >
                              Vault →
                            </Link>
                          </div>
                        </div>

                        <PillSplitMeter squadPct={Math.round(l.squadBps / 100)} />

                        <div className="grid grid-cols-3 border-2 border-[#311b63] bg-[#0c051a] divide-x-2 divide-[#311b63] font-mono text-xs">
                          <div className="px-3.5 py-2.5">
                            <span className="text-[10px] text-[#6a5991] block">
                              SQUAD SHARE
                            </span>
                            <span className="font-bold text-[#24e063]">
                              {Math.round(l.squadBps / 100)}%
                            </span>
                          </div>
                          <div className="px-3.5 py-2.5">
                            <span className="text-[10px] text-[#6a5991] block">
                              VAULT BALANCE
                            </span>
                            <span className="font-bold text-[#d8ff00]">
                              {formatSol(l.vaultBalanceLamports)}◎
                            </span>
                          </div>
                          <div className="px-3.5 py-2.5">
                            <span className="text-[10px] text-[#6a5991] block">
                              DISTRIBUTED
                            </span>
                            <span className="font-bold text-[#24e063]">
                              {formatSol(l.totalPaidLamports)}◎
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#6a5991]">
                          <div>
                            SPLITTER VAULT:{" "}
                            <span className="text-[#a99bc9]">{l.vault.publicKey}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(l.vault.publicKey)}
                              className="text-[#a99bc9] hover:text-[#d8ff00] cursor-pointer"
                            >
                              {copiedWallet === l.vault.publicKey ? "COPIED" : "COPY VAULT"}
                            </button>
                            <a
                              href={solscanUrl("account", l.vault.publicKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#d8ff00] hover:underline inline-flex items-center gap-1"
                            >
                              <span>VERIFY VAULT ON SOLSCAN</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
