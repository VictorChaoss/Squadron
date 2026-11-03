"use client";

import React from "react";

/**
 * Signature Two-Tone Pump Pill Capsule (green left, white right, thick dark border)
 * pulled directly from the 3 flying capsules in the Squadron logo.
 */
export function PumpCapsuleIcon({
  size = 22,
  angle = -14,
  className = "",
}: {
  size?: number;
  angle?: number;
  className?: string;
}) {
  const h = Math.round(size * 0.52);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 44 22"
      fill="none"
      style={{ transform: `rotate(${angle}deg)` }}
      className={`inline-block shrink-0 ${className}`}
    >
      {/* Left half: Pill Green */}
      <path
        d="M11 2H22V20H11C6.02944 20 2 15.9706 2 11C2 6.02944 6.02944 2 11 2Z"
        fill="#24e063"
      />
      {/* Right half: Crisp White */}
      <path
        d="M22 2H33C37.9706 2 42 6.02944 42 11C42 15.9706 37.9706 20 33 20H22V2Z"
        fill="#ffffff"
      />
      {/* Center seam + outer thick outline matching the logo */}
      <line x1="22" y1="2" x2="22" y2="20" stroke="#0b0418" strokeWidth="2.8" />
      <rect
        x="2"
        y="2"
        width="40"
        height="18"
        rx="9"
        stroke="#0b0418"
        strokeWidth="3.2"
      />
    </svg>
  );
}

/**
 * Triple Flying Pill Trail SVG — recreates the exact 3 neon-yellow contrails
 * and green/white capsules shooting out of the 'S' in the Squadron logo.
 */
export function SquadronPillStreams({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 72"
      fill="none"
      className={`block select-none pointer-events-none ${className}`}
    >
      {/* 3 Neon Volt Contrails */}
      <path
        d="M4 54 L268 15"
        stroke="#d8ff00"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M12 58 L298 32"
        stroke="#d8ff00"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M20 62 L322 50"
        stroke="#d8ff00"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Capsule 1 (Top) */}
      <g transform="translate(260, 2) rotate(-8)">
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" fill="#ffffff" stroke="#0b0418" strokeWidth="3" />
        <path d="M10 1.5H20.5V18.5H10C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5Z" fill="#24e063" />
        <line x1="20.5" y1="1.5" x2="20.5" y2="18.5" stroke="#0b0418" strokeWidth="2.6" />
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" stroke="#0b0418" strokeWidth="3" />
      </g>

      {/* Capsule 2 (Middle) */}
      <g transform="translate(290, 20) rotate(-6)">
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" fill="#ffffff" stroke="#0b0418" strokeWidth="3" />
        <path d="M10 1.5H20.5V18.5H10C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5Z" fill="#24e063" />
        <line x1="20.5" y1="1.5" x2="20.5" y2="18.5" stroke="#0b0418" strokeWidth="2.6" />
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" stroke="#0b0418" strokeWidth="3" />
      </g>

      {/* Capsule 3 (Bottom) */}
      <g transform="translate(314, 39) rotate(-4)">
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" fill="#ffffff" stroke="#0b0418" strokeWidth="3" />
        <path d="M10 1.5H20.5V18.5H10C5.30558 18.5 1.5 14.6944 1.5 10C1.5 5.30558 5.30558 1.5 10 1.5Z" fill="#24e063" />
        <line x1="20.5" y1="1.5" x2="20.5" y2="18.5" stroke="#0b0418" strokeWidth="2.6" />
        <rect x="1.5" y="1.5" width="38" height="17" rx="8.5" stroke="#0b0418" strokeWidth="3" />
      </g>
    </svg>
  );
}

/**
 * 20-Slot Squad Roster Capacity Meter.
 * Slots 1..10 = Native PumpFees limit (Pill Green).
 * Slots 11..20 = Squadron Splitter Overdrive slots (Neon Volt #d8ff00).
 */
export function RosterSlotBar({
  memberCount,
  maxSlots = 20,
}: {
  memberCount: number;
  maxSlots?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="slot-grid-20">
        {Array.from({ length: maxSlots }, (_, idx) => {
          const filled = idx < memberCount;
          const isOverdrive = idx >= 10;
          return (
            <div
              key={idx}
              title={
                filled
                  ? isOverdrive
                    ? `Slot #${idx + 1}: Active via Squadron Splitter Bypass (>10 cap)`
                    : `Slot #${idx + 1}: Active Squad Wallet`
                  : `Slot #${idx + 1}: Open`
              }
              className={`h-2.5 transition-all ${
                filled
                  ? isOverdrive
                    ? "bg-[#d8ff00] border border-[#0b0418]"
                    : "bg-[#24e063] border border-[#0b0418]"
                  : "bg-[#1e0e40] border border-[#2d165e]"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Two-Tone Pill Split Meter showing Squad Vault % (Green/Volt left) vs Creator % (White/Lilac right)
 */
export function PillSplitMeter({ squadPct }: { squadPct: number }) {
  const clamped = Math.max(5, Math.min(100, squadPct));
  return (
    <div className="w-full h-3.5 rounded-full bg-white border-2 border-[#090314] overflow-hidden flex shadow-[2px_2px_0px_#05010a]">
      <div
        style={{ width: `${clamped}%` }}
        className="h-full bg-gradient-to-r from-[#24e063] to-[#d8ff00] border-r-2 border-[#090314] transition-all duration-200"
      />
    </div>
  );
}
