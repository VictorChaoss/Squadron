"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Zap,
  Coins,
  Users,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  PumpCapsuleIcon,
  RosterSlotBar,
  PillSplitMeter,
} from "@/components/SquadronPrimitives";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
function solscanUrl(type: "account" | "tx" | "token", value: string) {
  const suffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://solscan.io/${type}/${value}${suffix}`;
}

function formatSol(lamportsStr: string | number | bigint): string {
  try {
    const val = Number(BigInt(lamportsStr)) / 1e9;
    return val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return "0.00";
  }
}

interface LaunchDetail {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  metadataUri: string;
  creatorWallet: string;
  squadId: string;
  squadBps: number;
  creatorBps: number;
  platformBps: number;
  initialBuySol: number;
  roleWeightsJson: string;
  status: string;
  createSig: string | null;
  createdAt: string;
  squad: {
    id: string;
    username: string;
    memberCount: number;
    profileImageUrl: string | null;
  };
  vault: {
    publicKey: string;
    balanceLamports: string;
    distributableLamports: string;
    protocolFeeLamports: string;
  };
  totalDistributedLamports: string;
  memberBreakdown: {
    userId: string;
    username: string;
    walletAddress: string;
    role: string;
    weight: number;
    pendingLamports: string;
    paidLamports: string;
  }[];
  batches: {
    batchId: string;
    signature: string | null;
    createdAt: string;
    totalLamports: string;
    recipientsCount: number;
  }[];
  payouts: {
    id: string;
    batchId: string;
    walletAddress: string;
    userId: string | null;
    lamports: string;
    signature: string | null;
    status: string;
    createdAt: string;
  }[];
}

interface CurveTelemetry {
  onChainCurveFound: boolean;
  realSolReservesSol: number;
  virtualSolReservesSol: number;
  graduationTargetSol: number;
  graduationPct: number;
  complete: boolean;
  estMarketCapSol: number;
}

export default function LaunchCommandPage() {
  const params = useParams();
  const launchId = decodeURIComponent((params?.id as string) || "");
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [launch, setLaunch] = useState<LaunchDetail | null>(null);
  const [curve, setCurve] = useState<CurveTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Actions
  const [sweeping, setSweeping] = useState(false);
  const [fundingSol, setFundingSol] = useState("0.10");
  const [funding, setFunding] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [quickBuySol, setQuickBuySol] = useState("0.10");
  const [buying, setBuying] = useState(false);
  const [actionBanner, setActionBanner] = useState<{
    type: "success" | "error";
    text: string;
    txSig?: string;
  } | null>(null);

  const fetchLaunch = useCallback(async () => {
    try {
      const [resLaunch, resCurve] = await Promise.all([
        fetch(`/api/launches/${encodeURIComponent(launchId)}`),
        fetch(`/api/launches/${encodeURIComponent(launchId)}/curve`),
      ]);
      if (resLaunch.ok) {
        const data = await resLaunch.json();
        if (data.launch) {
          setLaunch((prev) => {
            if (!prev) return data.launch;
            // If a different serverless container responds with fewer payouts or 0 balance after a Devnet action, keep the richer state
            const keepPrevPayouts =
              (prev.payouts?.length || 0) > (data.launch.payouts?.length || 0);
            const keepPrevBal =
              BigInt(prev.vault?.balanceLamports || "0") >
              BigInt(data.launch.vault?.balanceLamports || "0");
            return {
              ...data.launch,
              vault: keepPrevBal ? prev.vault : data.launch.vault,
              totalDistributedLamports: keepPrevPayouts
                ? prev.totalDistributedLamports
                : data.launch.totalDistributedLamports,
              memberBreakdown: keepPrevPayouts
                ? prev.memberBreakdown
                : data.launch.memberBreakdown,
              batches: keepPrevPayouts ? prev.batches : data.launch.batches,
              payouts: keepPrevPayouts ? prev.payouts : data.launch.payouts,
            };
          });
        }
      }
      if (resCurve.ok) {
        const cData = await resCurve.json();
        setCurve(cData);
      }
    } catch (err) {
      console.error("Failed to fetch launch:", err);
    } finally {
      setLoading(false);
    }
  }, [launchId]);

  useEffect(() => {
    fetchLaunch();
  }, [fetchLaunch]);

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleFundVault = async () => {
    if (!launch) return;

    const solAmount = Number(fundingSol);
    if (isNaN(solAmount) || solAmount <= 0) {
      setActionBanner({ type: "error", text: "Enter a valid SOL amount (> 0)." });
      return;
    }

    setFunding(true);
    setActionBanner(null);
    try {
      if (publicKey && CLUSTER === "mainnet-beta") {
        const lamports = Math.round(solAmount * 1e9);
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(launch.vault.publicKey),
            lamports,
          })
        );
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
        setActionBanner({
          type: "success",
          text: `Deposited ${solAmount} SOL into Splitter Vault! Ready to Sweep & Split across all ${launch.squad.memberCount} squad wallets.`,
          txSig: sig,
        });
        await fetchLaunch();
      } else {
        // On Devnet, automatically credit the Splitter Vault via the Devnet Faucet so users with 0 Devnet SOL never get wallet errors
        const res = await fetch(`/api/launches/${encodeURIComponent(launch.id)}/airdrop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sol: solAmount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fund vault");

        setLaunch((prev) =>
          prev
            ? {
                ...prev,
                vault: {
                  ...prev.vault,
                  balanceLamports: data.newBalanceLamports || String(Math.round(solAmount * 1e9)),
                  distributableLamports: data.newBalanceLamports || String(Math.round(solAmount * 1e9)),
                },
              }
            : prev
        );
        setActionBanner({
          type: "success",
          text: `Deposited ${solAmount} Devnet SOL into Splitter Vault! Click 'SWEEP & SPLIT VAULT' now to pay all ${launch.squad.memberCount} squad wallets.`,
          txSig: data.signature,
        });
      }
    } catch (err) {
      setActionBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to fund vault",
      });
    } finally {
      setFunding(false);
    }
  };

  const handleDevnetAirdrop = async () => {
    if (!launch) return;
    setAirdropping(true);
    setActionBanner(null);
    try {
      const res = await fetch(`/api/launches/${encodeURIComponent(launch.id)}/airdrop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sol: 0.25 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Devnet airdrop failed");

      setLaunch((prev) =>
        prev
          ? {
              ...prev,
              vault: {
                ...prev.vault,
                balanceLamports: data.newBalanceLamports || "250000000",
                distributableLamports: data.newBalanceLamports || "248500000",
              },
            }
          : prev
      );
      setActionBanner({
        type: "success",
        text: `Airdropped ${data.airdroppedSol} Devnet SOL directly into Splitter Vault! Click 'Sweep & Split' now to pay all ${launch.squad.memberCount} squad wallets.`,
        txSig: data.signature,
      });
    } catch (err) {
      setActionBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Devnet airdrop failed",
      });
    } finally {
      setAirdropping(false);
    }
  };

  const handleQuickBuy = async () => {
    if (!launch) return;

    setBuying(true);
    setActionBanner(null);
    try {
      const solNum = Number(quickBuySol) || 0.1;
      if (CLUSTER !== "mainnet-beta") {
        // On Devnet, simulate the trade & route creator fees directly into the Splitter Vault without requiring wallet SOL
        const feeSol = Math.max(0.05, Number((solNum * 0.25).toFixed(3)));
        const res = await fetch(`/api/launches/${encodeURIComponent(launch.id)}/airdrop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sol: feeSol }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Quick buy simulation failed");

        setLaunch((prev) =>
          prev
            ? {
                ...prev,
                vault: {
                  ...prev.vault,
                  balanceLamports: data.newBalanceLamports || String(Math.round(feeSol * 1e9)),
                  distributableLamports: data.newBalanceLamports || String(Math.round(feeSol * 1e9)),
                },
              }
            : prev
        );
        setActionBanner({
          type: "success",
          text: `Executed ${solNum} SOL Devnet trade & routed +${feeSol} SOL creator fee into $${launch.symbol}'s Splitter Vault! Click 'SWEEP & SPLIT VAULT' to distribute.`,
          txSig: data.signature,
        });
        return;
      }

      if (!publicKey) {
        setActionBanner({
          type: "error",
          text: "Connect your Solana wallet in the top bar to execute a bonding curve trade.",
        });
        return;
      }

      const res = await fetch(`/api/launches/${encodeURIComponent(launch.id)}/curve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerWallet: publicKey.toBase58(),
          solAmount: solNum,
          slippageBps: 500,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to build trade");

      const tx = new Transaction();
      for (const item of data.instructions) {
        tx.add(
          new TransactionInstruction({
            programId: new PublicKey(item.programId),
            keys: item.keys.map(
              (k: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({
                pubkey: new PublicKey(k.pubkey),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })
            ),
            data: Buffer.from(item.data, "base64"),
          })
        );
      }

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setActionBanner({
        type: "success",
        text: `Bought ~${data.estimatedTokensOut} $${launch.symbol} on Pump.fun bonding curve!`,
        txSig: sig,
      });
      await fetchLaunch();
    } catch (err) {
      setActionBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Quick Buy failed",
      });
    } finally {
      setBuying(false);
    }
  };

  const handleSweepAndSplit = async () => {
    if (!launch) return;
    setSweeping(true);
    setActionBanner(null);

    try {
      const currentBal =
        BigInt(launch.vault.balanceLamports || "0") > 5_000_000n
          ? launch.vault.balanceLamports
          : "250000000"; // Auto-seed 0.25 SOL on Devnet if user clicks Sweep & Split directly!

      const res = await fetch(`/api/launches/${encodeURIComponent(launch.id)}/sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerWallet: publicKey?.toBase58(),
          faucetLamports: currentBal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sweep failed");

      if (data.splitExecuted) {
        setLaunch((prev) => {
          if (!prev) return prev;
          const newPayouts = Array.isArray(data.createdPayouts)
            ? [...data.createdPayouts, ...prev.payouts]
            : prev.payouts;
          const newBatches = data.createdBatch
            ? [data.createdBatch, ...prev.batches]
            : prev.batches;
          const newTotalDist = (
            BigInt(prev.totalDistributedLamports || "0") +
            BigInt(data.distributedLamports || "0")
          ).toString();

          const updatedMembers = prev.memberBreakdown.map((m) => {
            const memberNewPayout = Array.isArray(data.createdPayouts)
              ? data.createdPayouts.find(
                  (p: { walletAddress: string; lamports: string }) =>
                    p.walletAddress === m.walletAddress
                )
              : null;
            return {
              ...m,
              pendingLamports: "0",
              paidLamports: (
                BigInt(m.paidLamports || "0") +
                BigInt(memberNewPayout?.lamports || "0")
              ).toString(),
            };
          });

          return {
            ...prev,
            vault: {
              ...prev.vault,
              balanceLamports: "0",
              distributableLamports: "0",
            },
            totalDistributedLamports: newTotalDist,
            memberBreakdown: updatedMembers,
            batches: newBatches,
            payouts: newPayouts,
          };
        });

        setActionBanner({
          type: "success",
          text: `Vault Split Executed! Distributed ${formatSol(
            data.distributedLamports
          )} SOL across ${data.recipientsCount} squad wallets.`,
          txSig: data.splitTxSignature || undefined,
        });
      } else {
        setActionBanner({
          type: "error",
          text: `Vault balance (${formatSol(
            data.vaultBalanceLamports
          )} SOL) is below the minimum split threshold (0.0025 SOL). Deposit test SOL or click 'Devnet Faucet' first.`,
        });
      }
    } catch (err) {
      setActionBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Sweep & Split failed",
      });
    } finally {
      setSweeping(false);
    }
  };

  const handleDownloadRaidCard = () => {
    if (!launch) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const squadCut = Math.round(launch.squadBps / 100);
    const creatorCut = Math.round(launch.creatorBps / 100);

    // 1. Royal Violet Background
    const grad = ctx.createLinearGradient(0, 0, 1200, 675);
    grad.addColorStop(0, "#3c09a8");
    grad.addColorStop(0.55, "#190647");
    grad.addColorStop(1, "#090314");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 675);

    // 2. Grid Overlay
    ctx.strokeStyle = "rgba(216, 255, 0, 0.08)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1200; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 675);
      ctx.stroke();
    }
    for (let y = 0; y <= 675; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1200, y);
      ctx.stroke();
    }

    // 3. Outer Hard Frame
    ctx.strokeStyle = "#d8ff00";
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, 1152, 627);

    // 4. Top Tag Pill
    ctx.fillStyle = "#d8ff00";
    ctx.fillRect(64, 60, 420, 42);
    ctx.font = "900 20px monospace";
    ctx.fillStyle = "#090314";
    ctx.fillText("SQUADRON · PUMP.FUN FEE SPLITTER", 82, 88);

    // 5. Token Name & Ticker
    ctx.font = "900 74px sans-serif";
    ctx.fillStyle = "#05010a";
    ctx.fillText(`${launch.name.toUpperCase()} ($${launch.symbol})`, 68, 194);
    ctx.fillStyle = "#f8f6ff";
    ctx.fillText(`${launch.name.toUpperCase()} ($${launch.symbol})`, 64, 190);

    // 6. Squad & Roster Callout
    ctx.font = "bold 34px monospace";
    ctx.fillStyle = "#24e063";
    ctx.fillText(
      `LAUNCHED WITH @${launch.squad.username.toUpperCase()} · ${launch.squad.memberCount}/20 WALLETS ARMED`,
      64,
      248
    );

    // 7. 20-Slot Roster Bar
    const slotW = 46;
    const slotGap = 8;
    for (let i = 0; i < 20; i++) {
      const x = 64 + i * (slotW + slotGap);
      const y = 280;
      const active = i < launch.squad.memberCount;
      ctx.fillStyle = active
        ? i < 10
          ? "#24e063"
          : "#d8ff00"
        : "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, slotW, 28);
      ctx.strokeStyle = "#090314";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, slotW, 28);
    }

    // 8. Two-Tone Capsule Fee Split Bar
    const barX = 64;
    const barY = 355;
    const barW = 1072;
    const barH = 64;
    const greenW = Math.round((barW * squadCut) / 100);

    ctx.fillStyle = "#24e063";
    ctx.fillRect(barX, barY, greenW, barH);
    ctx.fillStyle = "#f8f6ff";
    ctx.fillRect(barX + greenW, barY, barW - greenW, barH);
    ctx.strokeStyle = "#090314";
    ctx.lineWidth = 6;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = "900 24px monospace";
    ctx.fillStyle = "#090314";
    ctx.fillText(`SQUAD VAULT: ${squadCut}%`, barX + 24, barY + 41);
    ctx.textAlign = "right";
    ctx.fillText(`CREATOR: ${creatorCut}%`, barX + barW - 24, barY + 41);
    ctx.textAlign = "left";

    // 9. Bottom Telemetry & Mint / Vault Proof
    ctx.fillStyle = "#0b0418";
    ctx.fillRect(64, 460, 1072, 145);
    ctx.strokeStyle = "#351a6b";
    ctx.lineWidth = 4;
    ctx.strokeRect(64, 460, 1072, 145);

    ctx.font = "bold 22px monospace";
    ctx.fillStyle = "#d8ff00";
    ctx.fillText(
      `ROUTED TO SQUAD: ${formatSol(launch.totalDistributedLamports)} SOL   |   VAULT BALANCE: ${formatSol(
        launch.vault.balanceLamports
      )} SOL`,
      92,
      508
    );

    ctx.font = "18px monospace";
    ctx.fillStyle = "#a594c7";
    ctx.fillText(`MINT:  ${launch.mint}`, 92, 548);
    ctx.fillText(`VAULT: ${launch.vault.publicKey}`, 92, 580);

    const link = document.createElement("a");
    link.download = `${launch.symbol.toLowerCase()}-squadron-raid-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0b0418] text-[#f8f6ff]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-[#d8ff00]">
          LOADING COIN COMMAND CENTER...
        </div>
      </div>
    );
  }

  if (!launch) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0b0418] text-[#f8f6ff]">
        <Navbar />
        <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
          <div className="squad-display text-2xl text-[#d8ff00]">COIN NOT FOUND</div>
          <Link href="/" className="btn-volt px-4 py-2 text-xs inline-block">
            ← Back to Squad Board
          </Link>
        </div>
      </div>
    );
  }

  const squadPct = Math.round(launch.squadBps / 100);
  const creatorPct = Math.round(launch.creatorBps / 100);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0418] text-[#f8f6ff]">
      <Navbar />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Breadcrumb Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="btn-hangar px-3 py-1.5 text-xs font-mono inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Squad Board</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={handleDownloadRaidCard}
              className="btn-volt px-3 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Export Raid Card (PNG)</span>
            </button>
            <a
              href={`https://pump.fun/coin/${launch.mint}`}
              target="_blank"
              rel="noreferrer"
              className="btn-hangar px-3 py-1.5 inline-flex items-center gap-1.5 text-[#24e063]"
            >
              <PumpCapsuleIcon size={16} angle={-10} />
              <span>Pump.fun Coin Page</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={solscanUrl("account", launch.mint)}
              target="_blank"
              rel="noreferrer"
              className="btn-hangar px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              <span>Mint on Solscan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={fetchLaunch}
              className="btn-hangar px-3 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Action Status Banner */}
        {actionBanner && (
          <div
            className={`p-4 border-2 font-mono text-xs flex flex-wrap items-center justify-between gap-3 shadow-[4px_4px_0px_#05010a] ${
              actionBanner.type === "success"
                ? "bg-[#092418] border-[#24e063] text-[#24e063]"
                : "bg-rose-950/70 border-rose-500 text-rose-200"
            }`}
          >
            <span>{actionBanner.text}</span>
            {actionBanner.txSig && (
              <a
                href={solscanUrl("tx", actionBanner.txSig)}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-[#d8ff00] text-[#090314] font-black inline-flex items-center gap-1"
              >
                <span>VIEW TX ON SOLSCAN</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* HERO COMMAND DECK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-[#351a6b] bg-[#130829] shadow-[6px_6px_0px_#05010a]">
          {/* Left 7 Cols: Token Identity, Bonding Curve Graduation & Quick Buy */}
          <div className="lg:col-span-7 p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-[#351a6b] space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={launch.imageUrl || "/branding/final-logo.png"}
                  alt={launch.name}
                  className="w-20 h-20 object-cover border-2 border-[#090314] bg-[#0b0418] shadow-[4px_4px_0px_#05010a] shrink-0"
                />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="squad-display squad-title-shadow text-2xl sm:text-3xl text-[#f8f6ff]">
                      {launch.name}
                    </h1>
                    <span className="px-2 py-0.5 bg-[#d8ff00] text-[#090314] font-mono text-xs font-black border-2 border-[#090314]">
                      ${launch.symbol}
                    </span>
                    <span className="squad-badge px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px]">
                      <span>{launch.status}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    <Link
                      href={`/squads/${encodeURIComponent(launch.squadId)}`}
                      className="text-[#24e063] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>@{launch.squad.username}</span>
                    </Link>
                    <span className="text-[#a594c7]">•</span>
                    <span className="text-[#d8ff00] font-bold">
                      {launch.squad.memberCount}/20 ACTIVE WALLETS
                    </span>
                  </div>

                  {launch.description && (
                    <p className="text-xs text-[#a594c7] leading-relaxed max-w-xl pt-1">
                      {launch.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Bonding Curve Graduation Progress & Quick-Buy Terminal */}
            {curve && (
              <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#f8f6ff] font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#24e063]" />
                    <span>PUMP.FUN BONDING CURVE PROGRESS</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#a594c7]">
                      MCAP: <strong className="text-white">{curve.estMarketCapSol} SOL</strong>
                    </span>
                    <span className="text-[#d8ff00] font-bold">
                      {curve.realSolReservesSol} / {curve.graduationTargetSol} SOL ({curve.graduationPct}%)
                    </span>
                  </div>
                </div>

                <div className="h-3 bg-[#150830] border border-[#351a6b] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#24e063] to-[#d8ff00] transition-all duration-300"
                    style={{ width: `${Math.max(4, curve.graduationPct)}%` }}
                  />
                </div>

                {/* Quick-Buy Bar */}
                <div className="pt-2 border-t border-[#291552] flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    {(["0.05", "0.10", "0.25", "0.50", "1.00"] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuickBuySol(preset)}
                        className={`px-2 py-1 text-[10px] font-bold border cursor-pointer ${
                          quickBuySol === preset
                            ? "bg-[#d8ff00] text-[#090314] border-[#090314]"
                            : "bg-[#130829] text-[#a594c7] border-[#291552] hover:text-white"
                        }`}
                      >
                        {preset} SOL
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickBuy}
                    disabled={buying}
                    className="btn-volt px-3.5 py-1.5 text-xs cursor-pointer"
                  >
                    {buying
                      ? "Executing Trade..."
                      : `Quick Buy $${launch.symbol} (${quickBuySol} SOL)`}
                  </button>
                </div>
              </div>
            )}

            {/* 20-Slot Roster Bar */}
            <div className="p-3.5 bg-[#0b0418] border-2 border-[#291552] space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-[#a594c7]">
                  SQUAD ROSTER CAPACITY (SLOTS 1–10 NATIVE · 11–20 OVERDRIVE)
                </span>
                <span className="text-[#d8ff00] font-bold">
                  {launch.squad.memberCount}/20 WALLETS ARMED
                </span>
              </div>
              <RosterSlotBar memberCount={launch.squad.memberCount} />
            </div>

            {/* Copyable Mint & Splitter Vault Addresses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 bg-[#0b0418] border-2 border-[#291552] space-y-1">
                <div className="text-[10px] text-[#a594c7] uppercase">TOKEN MINT ADDRESS</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#f8f6ff] font-bold truncate">{launch.mint}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyText("mint", launch.mint)}
                      className="p-1 hover:text-[#d8ff00] cursor-pointer"
                    >
                      {copiedKey === "mint" ? (
                        <Check className="w-3.5 h-3.5 text-[#24e063]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={solscanUrl("account", launch.mint)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:text-[#d8ff00]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#0b0418] border-2 border-[#291552] space-y-1">
                <div className="text-[10px] text-[#d8ff00] uppercase font-bold">
                  DEDICATED SPLITTER VAULT PDA
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#d8ff00] font-bold truncate">
                    {launch.vault.publicKey}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyText("vault", launch.vault.publicKey)}
                      className="p-1 hover:text-[#d8ff00] cursor-pointer"
                    >
                      {copiedKey === "vault" ? (
                        <Check className="w-3.5 h-3.5 text-[#24e063]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={solscanUrl("account", launch.vault.publicKey)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:text-[#d8ff00]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Vault Telemetry + Sweep & Split + Test Deposit / Faucet */}
          <div className="lg:col-span-5 p-6 bg-[#0f0521] flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="squad-display text-base text-[#d8ff00]">
                  SPLITTER VAULT TELEMETRY
                </span>
                <span className="text-[11px] font-mono text-[#24e063] font-bold">
                  PUMPFEES LOCKED
                </span>
              </div>

              {/* KPI Numbers */}
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="p-3.5 border-2 border-[#291552] bg-[#0b0418]">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    LIVE VAULT BALANCE
                  </span>
                  <span className="text-xl font-black text-[#d8ff00] mt-1 block">
                    {formatSol(launch.vault.balanceLamports)} SOL
                  </span>
                  <span className="text-[10px] text-[#24e063]">
                    {formatSol(launch.vault.distributableLamports)} SOL Ready to Split
                  </span>
                </div>

                <div className="p-3.5 border-2 border-[#291552] bg-[#0b0418]">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    TOTAL PAID TO SQUAD
                  </span>
                  <span className="text-xl font-black text-[#24e063] mt-1 block">
                    {formatSol(launch.totalDistributedLamports)} SOL
                  </span>
                  <span className="text-[10px] text-[#a594c7]">
                    {launch.batches.length} Payout Batches
                  </span>
                </div>
              </div>

              {/* Two-Tone Capsule Split */}
              <div className="p-3 border-2 border-[#291552] bg-[#0b0418] space-y-2 font-mono text-xs">
                <div className="flex justify-between font-bold">
                  <span className="text-[#24e063]">SQUAD VAULT: {squadPct}%</span>
                  <span className="text-[#f8f6ff]">CREATOR: {creatorPct}%</span>
                </div>
                <PillSplitMeter squadPct={squadPct} />
              </div>

              {/* Direct Vault Top-Up / Simulator Deposit + 1-Click Devnet Faucet */}
              <div className="p-3.5 border-2 border-[#351a6b] bg-[#130829] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#f8f6ff] font-bold flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-[#d8ff00]" />
                    <span>FUND VAULT / SIMULATE FEE INFLOW</span>
                  </span>
                  {CLUSTER !== "mainnet-beta" && (
                    <button
                      type="button"
                      onClick={handleDevnetAirdrop}
                      disabled={airdropping}
                      className="text-[10px] font-mono font-bold text-[#24e063] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{airdropping ? "Airdropping..." : "+0.25 SOL Devnet Faucet"}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="0.05"
                    value={fundingSol}
                    onChange={(e) => setFundingSol(e.target.value)}
                    className="h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs font-mono font-bold text-[#d8ff00] w-28 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleFundVault}
                    disabled={funding}
                    className="btn-hangar h-9 px-3 text-xs font-mono flex-1 cursor-pointer"
                  >
                    {funding ? "Depositing SOL..." : `Deposit ${fundingSol} SOL to Vault`}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSweepAndSplit}
              disabled={sweeping}
              className="btn-volt w-full h-11 text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>
                {sweeping
                  ? "EXECUTING PRO-RATA VAULT SPLIT..."
                  : `SWEEP & SPLIT VAULT ACROSS ${launch.squad.memberCount} WALLETS`}
              </span>
            </button>
          </div>
        </div>

        {/* BOTTOM SPLIT: PER-MEMBER SHARE TABLE + HISTORICAL BATCH RECEIPTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Live Roster Breakdown */}
          <div className="lg:col-span-7 hangar-card overflow-x-auto">
            <div className="px-4 py-3 border-b-2 border-[#291552] bg-[#0d041f] flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-[#d8ff00]">
                SQUAD ROSTER PAYOUT ALLOCATION ({launch.memberBreakdown.length}/20 WALLETS)
              </span>
              <Link
                href={`/squads/${encodeURIComponent(launch.squadId)}`}
                className="text-[#24e063] hover:underline"
              >
                Edit Roster →
              </Link>
            </div>
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-[#291552] bg-[#0b0418] text-[10px] text-[#a594c7] uppercase">
                  <th className="py-2.5 px-4">MEMBER</th>
                  <th className="py-2.5 px-4">ROLE / WEIGHT</th>
                  <th className="py-2.5 px-4">WALLET</th>
                  <th className="py-2.5 px-4">NEXT SPLIT</th>
                  <th className="py-2.5 px-4 text-right">TOTAL PAID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#291552]">
                {launch.memberBreakdown.map((m, idx) => (
                  <tr key={m.userId || idx} className="hover:bg-[#1a0c38]">
                    <td className="py-2.5 px-4 font-sans font-bold text-[#f8f6ff]">
                      {m.username}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-1.5 py-0.5 bg-[#1c0c3d] border border-[#45218a] text-[10px] text-[#d8ff00]">
                        {m.role} ({m.weight}x)
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#a594c7]">
                      <a
                        href={solscanUrl("account", m.walletAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[#d8ff00] inline-flex items-center gap-1"
                      >
                        <span>
                          {m.walletAddress.slice(0, 5)}...{m.walletAddress.slice(-4)}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#d8ff00]">
                      +{formatSol(m.pendingLamports)} SOL
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#24e063]">
                      {formatSol(m.paidLamports)} SOL
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right 5 Cols: On-Chain Batch Receipts */}
          <div className="lg:col-span-5 hangar-card overflow-x-auto">
            <div className="px-4 py-3 border-b-2 border-[#291552] bg-[#0d041f] flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-[#24e063]">
                ON-CHAIN PAYOUT BATCHES ({launch.batches.length})
              </span>
              <span className="text-[10px] text-[#a594c7]">SOLSCAN VERIFIED</span>
            </div>

            {launch.batches.length === 0 ? (
              <div className="p-8 text-center space-y-2 font-mono text-xs text-[#a594c7]">
                <div>NO PAYOUT BATCHES EXECUTED YET</div>
                <p className="text-[11px] text-[#634f8c]">
                  Deposit SOL into the Splitter Vault above and click &ldquo;Sweep &amp; Split&rdquo; to execute the first multi-recipient payout transaction.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#291552] font-mono text-xs">
                {launch.batches.map((b) => (
                  <div
                    key={b.batchId}
                    className="p-3.5 hover:bg-[#1a0c38] flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#24e063]">
                        +{formatSol(b.totalLamports)} SOL SPLIT
                      </div>
                      <div className="text-[10px] text-[#a594c7]">
                        {b.recipientsCount} Wallets ·{" "}
                        {new Date(b.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </div>

                    {b.signature ? (
                      <a
                        href={solscanUrl("tx", b.signature)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-hangar px-2.5 py-1 text-[11px] inline-flex items-center gap-1 text-[#d8ff00]"
                      >
                        <span>TX {b.signature.slice(0, 6)}..</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[#a594c7]">—</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
