"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  Zap,
  Users,
  Lock,
  ArrowRight,
  Layers,
  Coins,
} from "lucide-react";
import {
  PumpCapsuleIcon,
  RosterSlotBar,
  PillSplitMeter,
} from "./SquadronPrimitives";

export function ThesisSection({
  onLaunchClick,
  onRegisterSquadClick,
}: {
  onLaunchClick: () => void;
  onRegisterSquadClick: () => void;
}) {
  const [simVolumeSol, setSimVolumeSol] = useState<number>(2500);
  const [simSquadPct, setSimSquadPct] = useState<number>(80);
  const [simMembers, setSimMembers] = useState<number>(18);

  const creatorFeeSol = simVolumeSol * 0.01;
  const squadPoolSol = creatorFeeSol * (simSquadPct / 100);
  const perMemberSol = squadPoolSol / Math.max(1, simMembers);

  return (
    <div className="space-y-8">
      {/* 1. HERO MANIFESTO BANNER */}
      <div className="border-2 border-[#351a6b] bg-gradient-to-br from-[#3c09a8] via-[#220663] to-[#0e0326] p-6 sm:p-8 shadow-[6px_6px_0px_#05010a]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="squad-badge px-2.5 py-1 bg-[#d8ff00] text-[#090314] border-2 border-[#090314] text-xs font-mono shadow-[2px_2px_0px_#090314]">
                <span>THE SQUADRON THESIS</span>
              </span>
              <span className="text-xs font-mono font-bold text-[#24e063]">
                WHY PUMP.FUN NEEDS COLLABORATIVE INFRASTRUCTURE
              </span>
            </div>

            <h1 className="squad-display squad-title-shadow text-3xl sm:text-5xl text-[#f8f6ff] leading-[0.95]">
              TRENCHES ARE TEAM SPORTS.{" "}
              <span className="text-[#d8ff00]">SOLO LAUNCHES ARE BROKEN.</span>
            </h1>

            <p className="text-sm sm:text-base text-white/90 leading-relaxed max-w-3xl">
              Every Pump.fun runner is pushed by a squad—10 to 20+ trenchers raiding, calling, creating lore, and driving volume together. Yet when a coin launches on Pump.fun today, one dev wallet takes 100% of the creator fees, or hits Pump.fun&apos;s hard 10-wallet ceiling and permanently locked fee config.{" "}
              <strong className="text-[#d8ff00]">
                Squadron turns any Pump.fun Squad into an automated on-chain fee syndicate.
              </strong>
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onLaunchClick}
                className="btn-volt px-5 py-2.5 text-xs flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Launch a Squad Coin Now</span>
              </button>
              <button
                type="button"
                onClick={onRegisterSquadClick}
                className="btn-hangar px-4 py-2.5 text-xs flex items-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#24e063]" />
                <span>Register Your 20-Wallet Squad</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 bg-[#0b0418]/95 border-2 border-[#090314] p-5 shadow-[5px_5px_0px_#05010a] space-y-4 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#d8ff00] font-bold">PROTOCOL SPECS</span>
              <PumpCapsuleIcon size={22} angle={-12} />
            </div>
            <div className="space-y-2.5 text-xs divide-y divide-[#291552]">
              <div className="pt-2 flex justify-between">
                <span className="text-[#a594c7]">NATIVE PUMPFEES CAP:</span>
                <span className="text-rose-400 font-bold">10 WALLETS MAX</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-[#a594c7]">SQUADRON VAULT CAP:</span>
                <span className="text-[#24e063] font-bold">20+ WALLETS / SQUAD</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-[#a594c7]">ROSTER ROTATION:</span>
                <span className="text-[#d8ff00] font-bold">DYNAMIC RE-SYNC</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-[#a594c7]">BUNDLE / DUMP RISK:</span>
                <span className="text-[#24e063] font-bold">0% (SOL FEE SPLIT)</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-[#a594c7]">PUMPFEES PROGRAM:</span>
                <span className="text-white font-bold">pfeeUxB6..ojVZ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. THE 3 ON-CHAIN BOTTLENECKS WE SOLVE (BEFORE VS AFTER) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: What's Broken on Standard Pump.fun */}
        <div className="hangar-card p-6 border-2 border-rose-500/60 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#291552]">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span className="squad-display text-lg text-rose-400">
                THE PROBLEM: SOLO &amp; NATIVE PUMP.FUN LAUNCHES
              </span>
            </div>
            <span className="px-2 py-0.5 bg-rose-950 border border-rose-500 text-[10px] font-mono text-rose-300 font-bold">
              OLD WAY
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-rose-300">
                1. THE HARD 10-SHAREHOLDER CEILING
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                Pump.fun&apos;s on-chain <code className="text-white">PumpFees</code> program hard-caps creator fee sharing at <strong className="text-white">10 wallets</strong>. Real Pump.fun squads and alpha groups have 15 to 20+ active members—leaving half the squad unpaid.
              </p>
            </div>

            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-rose-300">
                2. PERMANENTLY FROZEN ROSTERS (ADMIN REVOKED)
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                On native Pump.fun, the first time you call <code className="text-white">updateFeeShares</code>, the contract sets <code className="text-white">admin_revoked = true</code>. If a member leaves the squad, gets kicked, or rotates wallets, you can <strong className="text-white">never</strong> update the split on-chain.
              </p>
            </div>

            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-rose-300">
                3. SUPPLY BUNDLING DESTROYS CHARTS
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                When squads try to reward members by bundling or airdropping token supply at launch, Bubblemaps and Axiom flag the coin as bundled—and 15 members dumping their token bags kills the chart before graduation.
              </p>
            </div>
          </div>
        </div>

        {/* Right: How Squadron Solves It */}
        <div className="hangar-card p-6 border-2 border-[#24e063] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#291552]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#24e063]" />
              <span className="squad-display text-lg text-[#24e063]">
                THE SOLUTION: SQUADRON SPLITTER VAULT TEK
              </span>
            </div>
            <span className="px-2 py-0.5 bg-[#092418] border border-[#24e063] text-[10px] font-mono text-[#24e063] font-bold">
              SQUADRON OVERDRIVE
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-[#d8ff00]">
                1. 10 → 20+ WALLET OVERDRIVE VIA DEDICATED VAULT PDA
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                At launch, Squadron generates a dedicated <strong className="text-[#d8ff00]">Splitter Vault</strong> for the coin and locks the squad&apos;s % cut to that single vault address on <code className="text-white">PumpFees</code>. One slot on Pump.fun&apos;s contract unlocks unlimited pro-rata splits to <strong className="text-[#24e063]">all 20+ squad wallets</strong>.
              </p>
            </div>

            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-[#d8ff00]">
                2. LIVE ROSTER RE-SYNC BEFORE EVERY PAYOUT BATCH
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                Even though Pump.fun locks the on-chain fee config to the Splitter Vault, Squadron re-syncs your squad&apos;s active roster before every vault sweep. New raiders get paid automatically; inactive wallets are dropped.
              </p>
            </div>

            <div className="p-3.5 bg-[#0b0418] border border-[#291552] space-y-1">
              <div className="font-mono font-bold text-[#d8ff00]">
                3. PURE SOL YIELD ALIGNMENT (ZERO CHART DUMPING)
              </div>
              <p className="text-[#a594c7] leading-relaxed">
                Squad members earn <strong className="text-[#24e063]">pure SOL creator fees</strong> from every trade on the bonding curve and PumpSwap—aligning all 20 raiders to push volume and graduate the coin without touching token supply.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. HOW THE 4-STEP ON-CHAIN ARCHITECTURE WORKS */}
      <div className="hangar-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#291552]">
          <div>
            <h2 className="squad-display text-xl text-[#d8ff00]">
              THE 4-STEP ON-CHAIN PIPELINE
            </h2>
            <p className="text-xs text-[#a594c7]">
              From selecting a Pump.fun squad to verifiable multi-wallet SOL payouts on Solscan.
            </p>
          </div>
          <span className="font-mono text-xs text-[#24e063] font-bold">
            ATOMIC SOLANA EXECUTION
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px] font-black">
                STEP 01
              </span>
              <Users className="w-4 h-4 text-[#24e063]" />
            </div>
            <div className="font-sans font-black text-sm text-[#f8f6ff]">
              AUTO-PULL SQUAD WALLETS
            </div>
            <p className="font-sans text-xs text-[#a594c7] leading-relaxed">
              Select any active Pump.fun Squad or register your custom 20-wallet roster. Every member&apos;s Solana address and role weight (<code className="text-white">OWNER / ADMIN / MEMBER</code>) is indexed automatically.
            </p>
          </div>

          <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px] font-black">
                STEP 02
              </span>
              <Lock className="w-4 h-4 text-[#d8ff00]" />
            </div>
            <div className="font-sans font-black text-sm text-[#f8f6ff]">
              DEPLOY + LOCK PUMPFEES
            </div>
            <p className="font-sans text-xs text-[#a594c7] leading-relaxed">
              One transaction executes <code className="text-white">create_v2</code>, <code className="text-white">createFeeSharingConfig</code>, and <code className="text-white">updateFeeShares</code>—locking your chosen % cut to the coin&apos;s dedicated Splitter Vault PDA.
            </p>
          </div>

          <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px] font-black">
                STEP 03
              </span>
              <Layers className="w-4 h-4 text-[#24e063]" />
            </div>
            <div className="font-sans font-black text-sm text-[#f8f6ff]">
              FEES STREAM TO VAULT
            </div>
            <p className="font-sans text-xs text-[#a594c7] leading-relaxed">
              Every buy and sell on the Pump.fun bonding curve accrues creator fees directly to the coin&apos;s Splitter Vault—tracked live in real time on the coin&apos;s Command Center.
            </p>
          </div>

          <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px] font-black">
                STEP 04
              </span>
              <Coins className="w-4 h-4 text-[#d8ff00]" />
            </div>
            <div className="font-sans font-black text-sm text-[#f8f6ff]">
              PRO-RATA SWEEP &amp; SPLIT
            </div>
            <p className="font-sans text-xs text-[#a594c7] leading-relaxed">
              Our Auto-Sweeper (or any member clicking <strong className="text-white">Sweep &amp; Split</strong>) fires a single multi-recipient Solana transaction paying all 20 squad wallets with a Solscan receipt.
            </p>
          </div>
        </div>
      </div>

      {/* 4. INTERACTIVE SQUAD FEE YIELD CALCULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-[#351a6b] bg-[#130829] shadow-[6px_6px_0px_#05010a]">
        <div className="lg:col-span-7 p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-[#351a6b] space-y-5">
          <div>
            <span className="squad-display text-xl text-[#d8ff00]">
              INTERACTIVE SQUAD YIELD SIMULATOR
            </span>
            <p className="text-xs text-[#a594c7] mt-0.5">
              See why squads raid 10x harder when every member earns live SOL creator fees from volume.
            </p>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div className="p-3.5 bg-[#0b0418] border-2 border-[#291552] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#a594c7]">COIN TRADING VOLUME (SOL)</span>
                <span className="text-[#d8ff00] font-bold">
                  {simVolumeSol.toLocaleString()} SOL VOLUME
                </span>
              </div>
              <input
                type="range"
                min="100"
                max="25000"
                step="100"
                value={simVolumeSol}
                onChange={(e) => setSimVolumeSol(Number(e.target.value))}
                className="w-full accent-[#d8ff00] cursor-pointer"
              />
            </div>

            <div className="p-3.5 bg-[#0b0418] border-2 border-[#291552] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#a594c7]">SQUAD VAULT FEE SHARE (%)</span>
                <span className="text-[#24e063] font-bold">
                  {simSquadPct}% TO SQUAD / {100 - simSquadPct}% CREATOR
                </span>
              </div>
              <PillSplitMeter squadPct={simSquadPct} />
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={simSquadPct}
                onChange={(e) => setSimSquadPct(Number(e.target.value))}
                className="w-full accent-[#24e063] cursor-pointer"
              />
            </div>

            <div className="p-3.5 bg-[#0b0418] border-2 border-[#291552] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#a594c7]">ACTIVE SQUAD ROSTER SIZE (1–20 WALLETS)</span>
                <span className="text-[#d8ff00] font-bold">
                  {simMembers}/20 WALLETS{" "}
                  {simMembers > 10 ? "(OVERDRIVE ACTIVE)" : "(NATIVE CAP)"}
                </span>
              </div>
              <RosterSlotBar memberCount={simMembers} />
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                value={simMembers}
                onChange={(e) => setSimMembers(Number(e.target.value))}
                className="w-full accent-[#d8ff00] cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 p-6 bg-[#0f0521] flex flex-col justify-between gap-5 font-mono">
          <div className="space-y-4">
            <span className="squad-display text-base text-[#24e063]">
              ESTIMATED ON-CHAIN PAYOUTS
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 border-2 border-[#291552] bg-[#0b0418]">
                <span className="text-[10px] text-[#a594c7] block">
                  TOTAL SQUAD VAULT POOL
                </span>
                <span className="text-2xl font-black text-[#24e063] mt-1 block">
                  {squadPoolSol.toFixed(2)} SOL
                </span>
              </div>
              <div className="p-4 border-2 border-[#291552] bg-[#0b0418]">
                <span className="text-[10px] text-[#a594c7] block">
                  PAYOUT PER MEMBER ({simMembers}w)
                </span>
                <span className="text-2xl font-black text-[#d8ff00] mt-1 block">
                  {perMemberSol.toFixed(3)} SOL
                </span>
              </div>
            </div>

            <div className="p-4 border-2 border-[#291552] bg-[#0b0418] space-y-2 text-xs">
              <div className="text-[#f8f6ff] font-bold">
                WHY CREATORS TAG PUMP.FUN SQUADS:
              </div>
              <p className="text-[#a594c7] font-sans leading-relaxed">
                Even if you are a solo dev, assigning 70%–80% of your coin&apos;s creator fees to a 20-member Pump.fun Squad gives 20 trenchers immediate SOL upside to raid your chart—turning any solo coin into a full squad deployment.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLaunchClick}
            className="btn-volt w-full h-11 text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Deploy With This Split Configuration</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
