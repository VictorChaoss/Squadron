"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { PumpCapsuleIcon } from "./SquadronPrimitives";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export type HubTab = "trenches" | "launch" | "leaderboard" | "earnings";

interface NavbarProps {
  activeTab?: HubTab;
  onSelectTab?: (tab: HubTab) => void;
  onOpenCreateSquad?: () => void;
  stats?: {
    totalLaunches: number;
    activeSquads: number;
    totalDistributedSol: string;
  };
}

export function Navbar({
  activeTab,
  onSelectTab,
  onOpenCreateSquad,
  stats,
}: NavbarProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const navItems: { id: HubTab; title: string; count?: number }[] = [
    { id: "trenches", title: "Squad Board", count: stats?.totalLaunches },
    { id: "leaderboard", title: "Squad Rep", count: stats?.activeSquads },
    { id: "earnings", title: "Splitter Pay" },
  ];

  const isLaunchActive = isHome && activeTab === "launch";

  return (
    <header className="sticky top-0 z-40 border-b-2 border-[#291552] bg-[#0b0418]/95 backdrop-blur-md">
      {/* Top 3px Contrail Accent Bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#4a00e0] via-[#d8ff00] to-[#24e063]" />

      <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Left: Official Transparent Cut-Out Squadron Logo + 3 Core Tabs */}
        <div className="flex items-center h-full gap-4 min-w-0">
          <Link
            href="/"
            onClick={() => onSelectTab?.("trenches")}
            className="flex items-center pr-4 h-full border-r-2 border-[#291552] shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/final-logo.png"
              alt="Squadron"
              className="h-10 w-auto object-contain select-none"
            />
          </Link>

          {/* Clean Single-Line Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-2 shrink-0">
            {navItems.map((item) => {
              const isActive = isHome && activeTab === item.id;
              const pill = (
                <span
                  className={`squad-badge h-9 px-3 text-xs border-2 transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#d8ff00] text-[#090314] border-[#090314] shadow-[3px_3px_0px_#090314]"
                      : "bg-[#150830] text-[#f8f6ff] border-[#351a6b] hover:border-[#d8ff00]"
                  }`}
                >
                  <span className="font-black tracking-tight">{item.title}</span>
                  {item.count !== undefined && (
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        isActive ? "text-[#090314]" : "text-[#24e063]"
                      }`}
                    >
                      ({item.count})
                    </span>
                  )}
                </span>
              );

              return isHome && onSelectTab ? (
                <button key={item.id} type="button" onClick={() => onSelectTab(item.id)}>
                  {pill}
                </button>
              ) : (
                <Link key={item.id} href={`/?tab=${item.id}`}>
                  {pill}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Compact Routed Stat + Register Squad + Launch Coin CTA + Wallet */}
        <div className="flex items-center gap-2.5 shrink-0">
          {stats && (
            <div className="hidden 2xl:flex items-center gap-2 px-3 h-9 bg-[#14072e] border-2 border-[#2d165e] text-xs font-mono whitespace-nowrap">
              <PumpCapsuleIcon size={18} angle={-10} />
              <span className="text-[#a594c7]">ROUTED:</span>
              <strong className="text-[#d8ff00]">{stats.totalDistributedSol} SOL</strong>
            </div>
          )}

          {onOpenCreateSquad && (
            <button
              type="button"
              onClick={onOpenCreateSquad}
              className="hidden sm:inline-flex btn-hangar h-9 px-3 text-xs items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-[#24e063]" />
              <span>+ Register Squad</span>
            </button>
          )}

          {isHome && onSelectTab ? (
            <button
              type="button"
              onClick={() => onSelectTab("launch")}
              className={`h-9 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer ${
                isLaunchActive
                  ? "bg-[#24e063] text-[#090314] font-black uppercase border-2 border-[#090314] shadow-[3px_3px_0px_#090314]"
                  : "btn-volt"
              }`}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Launch Squad Coin</span>
            </button>
          ) : (
            <Link
              href="/?tab=launch"
              className="btn-volt h-9 px-3.5 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Launch Squad Coin</span>
            </Link>
          )}

          <WalletMultiButton />
        </div>
      </div>

      {/* Tablet / Mobile Navigation Bar */}
      <div className="lg:hidden border-t border-[#291552] bg-[#0e0520] px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {navItems.map((item) => {
          const isActive = isHome && activeTab === item.id;
          const pill = (
            <span
              className={`squad-badge h-8 px-3 text-[11px] border transition-all cursor-pointer ${
                isActive
                  ? "bg-[#d8ff00] text-[#090314] border-[#090314]"
                  : "bg-[#150830] text-[#f8f6ff] border-[#351a6b]"
              }`}
            >
              <span>{item.title}</span>
              {item.count !== undefined && (
                <span className="font-mono text-[10px]">({item.count})</span>
              )}
            </span>
          );

          return isHome && onSelectTab ? (
            <button key={item.id} type="button" onClick={() => onSelectTab(item.id)}>
              {pill}
            </button>
          ) : (
            <Link key={item.id} href={`/?tab=${item.id}`}>
              {pill}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
