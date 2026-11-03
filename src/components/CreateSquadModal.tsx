"use client";

import React, { useState } from "react";
import { Plus, Trash2, X, Users } from "lucide-react";
import { SquadDetail, SquadRole } from "@/lib/squads/types";
import { PumpCapsuleIcon } from "./SquadronPrimitives";

interface MemberDraft {
  username: string;
  walletAddress: string;
  role: SquadRole;
}

interface CreateSquadModalProps {
  open: boolean;
  onClose: () => void;
  connectedWallet?: string | null;
  onCreated: (squad: SquadDetail) => void;
}

export function CreateSquadModal({
  open,
  onClose,
  connectedWallet,
  onCreated,
}: CreateSquadModalProps) {
  const [username, setUsername] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>([
    {
      username: "leader",
      walletAddress: connectedWallet || "",
      role: "OWNER",
    },
    {
      username: "member_2",
      walletAddress: "",
      role: "MEMBER",
    },
  ]);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAddRow = () => {
    if (members.length >= 20) return;
    setMembers((prev) => [
      ...prev,
      {
        username: `member_${prev.length + 1}`,
        walletAddress: "",
        role: "MEMBER",
      },
    ]);
  };

  const handleRemoveRow = (idx: number) => {
    if (members.length <= 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateRow = (idx: number, field: keyof MemberDraft, value: string) => {
    setMembers((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleParseBulk = () => {
    const lines = bulkInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed: MemberDraft[] = lines.slice(0, 20).map((addr, idx) => ({
      username: idx === 0 ? "leader" : `member_${idx + 1}`,
      walletAddress: addr,
      role: idx === 0 ? "OWNER" : "MEMBER",
    }));
    setMembers(parsed);
    setShowBulk(false);
    setBulkInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          members: members.filter((m) => m.walletAddress.trim().length > 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register squad");
      }
      onCreated(data.squad);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register squad");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border-2 border-[#d8ff00] bg-[#130829] shadow-[8px_8px_0px_#05010a] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0b0418] border-b-2 border-[#291552] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PumpCapsuleIcon size={22} angle={-12} />
            <span className="squad-display text-lg text-[#d8ff00]">
              REGISTER / IMPORT PUMP.FUN SQUAD
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#a594c7] hover:text-[#d8ff00] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <p className="text-xs text-[#a594c7] leading-relaxed">
            Create or import a squad with up to <strong className="text-[#d8ff00]">20 Solana member wallets</strong>. When you launch a coin for this squad, its dedicated Splitter Vault routes creator fees pro-rata across every wallet below.
          </p>

          <div>
            <label className="block text-[10px] font-mono font-bold uppercase text-[#d8ff00] mb-1">
              SQUAD HANDLE (@USERNAME) *
            </label>
            <input
              type="text"
              placeholder="e.g. degen_council"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs font-mono text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono font-bold text-[#24e063] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>ROSTER WALLETS ({members.length} / 20 SLOTS)</span>
            </span>
            <div className="flex items-center gap-2">
              {connectedWallet && (
                <button
                  type="button"
                  onClick={() => handleUpdateRow(0, "walletAddress", connectedWallet)}
                  className="btn-hangar px-2.5 py-1 text-[10px] font-mono cursor-pointer"
                >
                  Use Connected Wallet for #1
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowBulk(!showBulk)}
                className="btn-hangar px-2.5 py-1 text-[10px] font-mono cursor-pointer"
              >
                {showBulk ? "Hide Bulk Paste" : "Bulk Paste Wallets"}
              </button>
            </div>
          </div>

          {showBulk && (
            <div className="p-3 border-2 border-[#351a6b] bg-[#0b0418] space-y-2">
              <label className="block text-[10px] font-mono text-[#a594c7]">
                PASTE UP TO 20 SOLANA WALLET ADDRESSES (ONE PER LINE OR COMMA-SEPARATED)
              </label>
              <textarea
                rows={4}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Paste Solana addresses here..."
                className="w-full p-2 bg-[#130829] border border-[#291552] text-xs font-mono text-[#f8f6ff] focus:outline-none focus:border-[#d8ff00]"
              />
              <button
                type="button"
                onClick={handleParseBulk}
                className="btn-volt px-3 py-1 text-[11px] font-mono cursor-pointer"
              >
                Import Addresses into Roster
              </button>
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {members.map((m, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center bg-[#0b0418] p-2 border border-[#291552]"
              >
                <div className="col-span-1 text-[10px] font-mono font-bold text-[#d8ff00] text-center">
                  #{idx + 1}
                </div>
                <div className="col-span-3">
                  <input
                    type="text"
                    placeholder="Handle"
                    value={m.username}
                    onChange={(e) => handleUpdateRow(idx, "username", e.target.value)}
                    className="w-full h-8 px-2 bg-[#130829] border border-[#291552] text-xs text-[#f8f6ff] focus:outline-none focus:border-[#d8ff00]"
                  />
                </div>
                <div className="col-span-5">
                  <input
                    type="text"
                    placeholder="Solana Wallet Address (base58)..."
                    value={m.walletAddress}
                    onChange={(e) => handleUpdateRow(idx, "walletAddress", e.target.value)}
                    className="w-full h-8 px-2 bg-[#130829] border border-[#291552] text-xs font-mono text-[#f8f6ff] focus:outline-none focus:border-[#d8ff00]"
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      handleUpdateRow(idx, "role", e.target.value as SquadRole)
                    }
                    className="w-full h-8 px-1.5 bg-[#130829] border border-[#291552] text-[10px] font-mono font-bold text-[#d8ff00] focus:outline-none"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                  </select>
                </div>
                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    disabled={members.length <= 1}
                    className="text-[#a594c7] hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {members.length < 20 && (
            <button
              type="button"
              onClick={handleAddRow}
              className="btn-hangar w-full py-1.5 text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Wallet Slot ({members.length}/20)</span>
            </button>
          )}

          {error && (
            <div className="p-2.5 border-2 border-rose-500 bg-rose-950/60 text-xs font-mono text-rose-200">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t-2 border-[#291552]">
            <button
              type="button"
              onClick={onClose}
              className="btn-hangar px-4 py-2 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-volt px-5 py-2 text-xs cursor-pointer"
            >
              {saving ? "SAVING SQUAD..." : "SAVE SQUAD ROSTER"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
