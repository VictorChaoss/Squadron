"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Zap, ShieldCheck, Activity, Radio } from "lucide-react";

interface WorkerTelemetry {
  cluster: string;
  rpcHealthy: boolean;
  rpcLatencyMs: number;
  blockHeight: number;
  activeLaunchesCount: number;
  treasury: {
    configured: boolean;
    wallet: string | null;
    platformFeeBps: number;
    platformFeePct: string;
    balanceLamports: string;
  };
  config: {
    minPayoutLamports: string;
    sweepIntervalSeconds: number;
    pinataConfigured: boolean;
    pumpApiConfigured: boolean;
  };
  lastSweepAt: string | null;
  lastSweepSig: string | null;
}

export function AutoSweeperPanel({
  onSweepCompleted,
}: {
  onSweepCompleted?: () => void;
}) {
  const [telemetry, setTelemetry] = useState<WorkerTelemetry | null>(null);
  const [autoSweepEnabled, setAutoSweepEnabled] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(45);
  const [runningCycle, setRunningCycle] = useState<boolean>(false);
  const [lastLog, setLastLog] = useState<string>("Daemon standby · Ready for manual or scheduled cycle");

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/worker");
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const t = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(t);
  }, [fetchTelemetry]);

  const executeSweepCycle = useCallback(async () => {
    setRunningCycle(true);
    setLastLog("Scanning all Splitter Vault PDAs & syncing active squad rosters...");
    try {
      const res = await fetch("/api/payouts/sweep-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.sweptVaultsCount > 0) {
          const sol = (Number(data.totalDistributedLamports) / 1e9).toFixed(4);
          setLastLog(
            `Cycle Complete · Swept ${data.sweptVaultsCount} vaults (${sol} SOL paid to ${data.totalRecipientsPaid} member wallets)`
          );
        } else {
          setLastLog(
            `Cycle Complete · Scanned ${data.results?.length ?? 0} vaults (0 above 0.0025 SOL threshold)`
          );
        }
        await fetchTelemetry();
        onSweepCompleted?.();
      } else {
        setLastLog(`Cycle Error · ${data.error || "Failed"}`);
      }
    } catch {
      setLastLog("Cycle Error · Network request failed");
    } finally {
      setRunningCycle(false);
      setCountdown(45);
    }
  }, [fetchTelemetry, onSweepCompleted]);

  // Auto-Sweep countdown loop when enabled
  useEffect(() => {
    if (!autoSweepEnabled) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          executeSweepCycle();
          return 45;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoSweepEnabled, executeSweepCycle]);

  return (
    <div className="border-2 border-[#351a6b] bg-[#130829] p-4 shadow-[4px_4px_0px_#05010a] space-y-3 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#291552]">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              autoSweepEnabled
                ? "bg-[#24e063] animate-pulse shadow-[0_0_8px_#24e063]"
                : "bg-[#d8ff00]"
            }`}
          />
          <span className="squad-display text-sm text-[#d8ff00]">
            AUTO-SWEEPER DAEMON &amp; PROTOCOL ENGINE
          </span>
          {telemetry && (
            <span className="px-2 py-0.5 bg-[#0b0418] border border-[#291552] text-[10px] text-[#24e063]">
              RPC {telemetry.rpcHealthy ? `${telemetry.rpcLatencyMs}ms` : "OFFLINE"} · BLOCK #{telemetry.blockHeight.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAutoSweepEnabled((v) => !v);
              setCountdown(45);
            }}
            className={`px-3 py-1 text-[11px] font-bold border-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
              autoSweepEnabled
                ? "bg-[#24e063] text-[#090314] border-[#090314]"
                : "bg-[#0b0418] text-[#a594c7] border-[#291552] hover:text-white"
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>
              {autoSweepEnabled
                ? `AUTO-SWEEP ON (${countdown}s)`
                : "ENABLE AUTO-SWEEP (45s)"}
            </span>
          </button>

          <button
            type="button"
            onClick={executeSweepCycle}
            disabled={runningCycle}
            className="btn-volt px-3 py-1 text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {runningCycle ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            <span>{runningCycle ? "Running Cycle..." : "Run Sweep Cycle Now"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
        <div className="p-2.5 bg-[#0b0418] border border-[#291552] flex items-center justify-between">
          <span className="text-[#a594c7] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#d8ff00]" />
            <span>SWEEPER STATUS</span>
          </span>
          <span className="text-[#f8f6ff] font-bold truncate max-w-[230px]" title={lastLog}>
            {lastLog}
          </span>
        </div>

        <div className="p-2.5 bg-[#0b0418] border border-[#291552] flex items-center justify-between">
          <span className="text-[#a594c7] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#24e063]" />
            <span>PROTOCOL TREASURY CUT</span>
          </span>
          <span className="text-[#24e063] font-bold">
            {telemetry?.treasury.configured
              ? `${telemetry.treasury.platformFeePct}% (${telemetry.treasury.wallet?.slice(0, 4)}..)`
              : "0% (100% TO SQUADS)"}
          </span>
        </div>

        <div className="p-2.5 bg-[#0b0418] border border-[#291552] flex items-center justify-between">
          <span className="text-[#a594c7]">MIN VAULT SPLIT THRESHOLD</span>
          <span className="text-[#d8ff00] font-bold">
            0.0025 SOL (GAS + RENT GUARD)
          </span>
        </div>
      </div>
    </div>
  );
}
