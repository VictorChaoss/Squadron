"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  Search,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Sliders,
  Upload,
  LayoutGrid,
  Rows3,
  Table2,
  Zap,
  ExternalLink,
  Users,
} from "lucide-react";
import { Navbar, HubTab } from "@/components/Navbar";
import { CreateSquadModal } from "@/components/CreateSquadModal";
import { AutoSweeperPanel } from "@/components/AutoSweeperPanel";
import { ThesisSection } from "@/components/ThesisSection";
import {
  PumpCapsuleIcon,
  RosterSlotBar,
  PillSplitMeter,
} from "@/components/SquadronPrimitives";
import { SquadDetail, SquadSummary } from "@/lib/squads/types";
import { splitLamports, RoleWeights } from "@/lib/split";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
function solscanUrl(type: "account" | "tx" | "token", value: string) {
  const suffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://solscan.io/${type}/${value}${suffix}`;
}

interface LaunchRow {
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
  initialBuySol: number;
  roleWeightsJson: string;
  status: string;
  createSig: string | null;
  createdAt: string;
  totalDistributedLamports: string;
  squad: {
    id: string;
    username: string;
    memberCount: number;
    profileImageUrl: string | null;
  };
  vault: {
    publicKey: string;
  };
  _count: {
    payouts: number;
    sweeps: number;
  };
}

interface LeaderboardRow extends SquadSummary {
  rank: number;
  launchesCount: number;
  liveLaunchesCount: number;
  feesDistributedLamports: string;
  repScore: number;
}

interface WalletHubData {
  address: string;
  totalEarnedLamports: string;
  claimableLamportsTotal: string;
  squadPositions: {
    squadId: string;
    squadUsername: string;
    role: string;
    memberCount: number;
    launches: {
      id: string;
      mint: string;
      name: string;
      symbol: string;
      squadBps: number;
      status: string;
      vaultPublicKey: string;
      vaultBalanceLamports: string;
      myPendingShareLamports: string;
    }[];
  }[];
  createdLaunches: LaunchRow[];
  payouts: {
    id: string;
    launchId: string;
    batchId: string;
    walletAddress: string;
    lamports: string;
    signature: string | null;
    status: string;
    createdAt: string;
    launch: { name: string; symbol: string; mint: string; squadId: string };
  }[];
}

interface GlobalPayoutsFeed {
  stats: {
    activeVaultsCount: number;
    totalPendingInVaultsLamports: string;
    totalDistributedLamports: string;
    totalBatchesCount: number;
    activeMembersCount: number;
  };
  vaults: {
    launchId: string;
    name: string;
    symbol: string;
    mint: string;
    imageUrl: string | null;
    squadId: string;
    squadUsername: string;
    memberCount: number;
    squadBps: number;
    creatorBps: number;
    vaultPublicKey: string;
    vaultBalanceLamports: string;
    distributableLamports: string;
    totalPaidLamports: string;
    payoutsCount: number;
    createdAt: string;
  }[];
  batches: {
    batchId: string;
    launchId: string;
    coinName: string;
    coinSymbol: string;
    mint: string;
    squadId: string;
    squadUsername: string;
    signature: string | null;
    createdAt: string;
    totalLamports: string;
    recipientsCount: number;
  }[];
  recentPayouts: {
    id: string;
    batchId: string;
    launchId: string;
    coinName: string;
    coinSymbol: string;
    squadId: string;
    squadUsername: string;
    walletAddress: string;
    lamports: string;
    signature: string | null;
    status: string;
    createdAt: string;
  }[];
}

type ViewLayout = "grid" | "trench" | "table";
type BoardSort = "newest" | "squad_split" | "fees_paid" | "roster_size";

function formatSol(lamportsStr: string | number | bigint): string {
  const num = Number(lamportsStr) / 1e9;
  if (num === 0) return "0.00";
  if (num < 0.001) return num.toFixed(5);
  return num.toFixed(3);
}

function formatCompactUsd(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function HubContent() {
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [activeTab, setActiveTab] = useState<HubTab>("trenches");
  const [viewLayout, setViewLayout] = useState<ViewLayout>("grid");
  const [sortBy, setSortBy] = useState<BoardSort>("newest");
  const [catalystOpen, setCatalystOpen] = useState<"SPLITTER" | "ROSTER" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Trench Board State
  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [loadingLaunches, setLoadingLaunches] = useState(true);
  const [trenchSearch, setTrenchSearch] = useState("");
  const [trenchSquadFilter, setTrenchSquadFilter] = useState<string>("ALL");

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Squad Selector & Studio State
  const [squadSearch, setSquadSearch] = useState("");
  const [squads, setSquads] = useState<SquadSummary[]>([]);
  const [selectedSquad, setSelectedSquad] = useState<SquadDetail | null>(null);
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [loadingSquadDetail, setLoadingSquadDetail] = useState(false);

  // Pro Launch Form State
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [squadSharePercent, setSquadSharePercent] = useState<number>(80);
  const [initialBuySol, setInitialBuySol] = useState<string>("0.02");
  const [weightPreset, setWeightPreset] = useState<"equal" | "tiered" | "custom">("equal");
  const [roleWeights, setRoleWeights] = useState<RoleWeights>({ OWNER: 1, ADMIN: 1, MEMBER: 1 });
  const [estVolumeSol, setEstVolumeSol] = useState<number>(500);
  const [demoMode, setDemoMode] = useState<boolean>(CLUSTER !== "mainnet-beta");
  const [createSquadOpen, setCreateSquadOpen] = useState<boolean>(false);

  // Launch Execution State
  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchResult, setLaunchResult] = useState<{
    launchId: string;
    mint: string;
    vaultPublicKey: string;
    createSig: string;
  } | null>(null);

  // Wallet Earnings & Global Splitter Feed State
  const [walletData, setWalletData] = useState<WalletHubData | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [lookupWalletInput, setLookupWalletInput] = useState("");
  const [sweepingLaunchId, setSweepingLaunchId] = useState<string | null>(null);
  const [globalPayouts, setGlobalPayouts] = useState<GlobalPayoutsFeed | null>(null);
  const [loadingGlobalPayouts, setLoadingGlobalPayouts] = useState(false);

  useEffect(() => {
    const t = searchParams.get("tab") as HubTab | null;
    if (t && ["trenches", "launch", "leaderboard", "earnings", "thesis"].includes(t)) {
      setActiveTab(t);
    }
    const sqId = searchParams.get("squadId");
    if (sqId) {
      fetch(`/api/squads/${encodeURIComponent(sqId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.squad) setSelectedSquad(d.squad);
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const fetchLaunches = useCallback(async () => {
    setLoadingLaunches(true);
    try {
      const res = await fetch("/api/launches");
      const data = await res.json();
      if (data.launches) setLaunches(data.launches);
    } catch (err) {
      console.error("Failed to fetch launches:", err);
    } finally {
      setLoadingLaunches(false);
    }
  }, []);

  useEffect(() => {
    fetchLaunches();
  }, [fetchLaunches]);

  const fetchLeaderboard = useCallback(async (period: "daily" | "weekly" | "monthly") => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`);
      const data = await res.json();
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(leaderboardPeriod);
  }, [fetchLeaderboard, leaderboardPeriod]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingSquads(true);
      try {
        const url =
          squadSearch.trim().length >= 2
            ? `/api/squads?q=${encodeURIComponent(squadSearch.trim())}`
            : `/api/squads?period=weekly`;
        const res = await fetch(url);
        const data = await res.json();
        if (active && data.squads) {
          setSquads(data.squads);
          if (!selectedSquad && data.squads.length > 0) {
            fetch(`/api/squads/${encodeURIComponent(data.squads[0].id)}`)
              .then((r) => r.json())
              .then((d) => {
                if (active && d.squad) setSelectedSquad(d.squad);
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        console.error("Failed to load squads:", err);
      } finally {
        if (active) setLoadingSquads(false);
      }
    };
    const timer = setTimeout(load, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [squadSearch, selectedSquad]);

  const fetchGlobalPayouts = useCallback(async () => {
    setLoadingGlobalPayouts(true);
    try {
      const res = await fetch("/api/payouts");
      const data = await res.json();
      if (res.ok) setGlobalPayouts(data);
    } catch (err) {
      console.error("Failed to load global payouts feed:", err);
    } finally {
      setLoadingGlobalPayouts(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalPayouts();
  }, [fetchGlobalPayouts]);

  const fetchWalletHub = useCallback(async (addr: string) => {
    if (!addr) return;
    setLoadingWallet(true);
    try {
      const res = await fetch(`/api/wallet/${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (res.ok) setWalletData(data);
    } catch (err) {
      console.error("Failed to load wallet hub:", err);
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  useEffect(() => {
    if (publicKey) {
      const base58 = publicKey.toBase58();
      setLookupWalletInput(base58);
      fetchWalletHub(base58);
    }
  }, [publicKey, fetchWalletHub]);

  const handleSelectSquad = async (sq: SquadSummary) => {
    setLoadingSquadDetail(true);
    setLaunchError(null);
    try {
      const res = await fetch(`/api/squads/${encodeURIComponent(sq.id)}`);
      const data = await res.json();
      if (data.squad) {
        setSelectedSquad(data.squad);
      }
    } catch {
      setLaunchError("Could not load squad roster");
    } finally {
      setLoadingSquadDetail(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const generateBadgeImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Royal Violet gradient background
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#3c09a8");
    grad.addColorStop(0.55, "#190647");
    grad.addColorStop(1, "#090314");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(216, 255, 0, 0.12)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Thick Neon Volt outer frame
    ctx.strokeStyle = "#d8ff00";
    ctx.lineWidth = 14;
    ctx.strokeRect(20, 20, 472, 472);

    // Two-Tone Pump Capsule Icon in center-top
    ctx.save();
    ctx.translate(256, 175);
    ctx.rotate((-14 * Math.PI) / 180);

    // Shadow
    ctx.fillStyle = "#05010a";
    ctx.beginPath();
    ctx.roundRect(-110, -44, 228, 96, 48);
    ctx.fill();

    // Left Half (Capsule Green)
    ctx.fillStyle = "#24e063";
    ctx.beginPath();
    ctx.roundRect(-114, -48, 114, 96, [48, 0, 0, 48]);
    ctx.fill();

    // Right Half (White)
    ctx.fillStyle = "#f8f6ff";
    ctx.beginPath();
    ctx.roundRect(0, -48, 114, 96, [0, 48, 48, 0]);
    ctx.fill();

    // Capsule Outline
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#090314";
    ctx.beginPath();
    ctx.roundRect(-114, -48, 228, 96, 48);
    ctx.stroke();
    ctx.restore();

    // Ticker text
    const tickerText = `$${(symbol || "SQUAD").slice(0, 8).toUpperCase()}`;
    ctx.font = "900 72px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#090314";
    ctx.fillText(tickerText, 262, 346);
    ctx.fillStyle = "#d8ff00";
    ctx.fillText(tickerText, 256, 340);

    // Squad handle pill at bottom
    const sqText = selectedSquad ? `@${selectedSquad.username.toUpperCase()}` : "SQUADRON SYNDICATE";
    ctx.font = "bold 26px monospace";
    ctx.fillStyle = "#24e063";
    ctx.fillText(sqText, 256, 410);

    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#f8f6ff";
    ctx.fillText(`${squadSharePercent}% ON-CHAIN SQUAD SPLIT`, 256, 452);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const generatedFile = new File([blob], `${(symbol || "squad").toLowerCase()}-emblem.png`, {
        type: "image/png",
      });
      setImageFile(generatedFile);
      setImagePreview(URL.createObjectURL(generatedFile));
      triggerToast(`Generated custom $${symbol || "SQUAD"} emblem!`);
    }, "image/png");
  };

  const handlePresetChange = (preset: "equal" | "tiered" | "custom") => {
    setWeightPreset(preset);
    if (preset === "equal") setRoleWeights({ OWNER: 1, ADMIN: 1, MEMBER: 1 });
    if (preset === "tiered") setRoleWeights({ OWNER: 3, ADMIN: 2, MEMBER: 1 });
  };

  const [sweepingAll, setSweepingAll] = useState(false);

  const handleSweepAllVaults = async () => {
    setSweepingAll(true);
    try {
      const res = await fetch("/api/payouts/sweep-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch sweep failed");

      if (data.sweptVaultsCount > 0) {
        triggerToast(
          `Batch Swept ${data.sweptVaultsCount} Vaults · Paid ${formatSol(
            data.totalDistributedLamports
          )} SOL to ${data.totalRecipientsPaid} wallets!`
        );
      } else {
        triggerToast("All vaults scanned · 0 vaults above minimum split threshold (0.0025 SOL)");
      }
      fetchLaunches();
      fetchGlobalPayouts();
      if (lookupWalletInput) fetchWalletHub(lookupWalletInput);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Batch sweep failed");
    } finally {
      setSweepingAll(false);
    }
  };

  const handleTriggerSweep = async (launchId: string) => {
    setSweepingLaunchId(launchId);
    try {
      const res = await fetch(`/api/launches/${launchId}/sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerWallet: publicKey?.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sweep failed");

      if (data.curveSweepInstructions?.length > 0 && publicKey && signTransaction) {
        try {
          const tx = new Transaction();
          for (const item of data.curveSweepInstructions) {
            tx.add(
              new TransactionInstruction({
                programId: new PublicKey(item.programId),
                keys: item.keys.map((k: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({
                  pubkey: new PublicKey(k.pubkey),
                  isSigner: k.isSigner,
                  isWritable: k.isWritable,
                })),
                data: Buffer.from(item.data, "base64"),
              })
            );
          }
          const { blockhash } = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          tx.feePayer = publicKey;
          const signed = await signTransaction(tx);
          const sig = await connection.sendRawTransaction(signed.serialize());
          await connection.confirmTransaction(sig, "confirmed");
        } catch {
          // Optional curve sweep skipped
        }
      }

      if (data.splitExecuted) {
        triggerToast(
          `Split ${formatSol(data.distributedLamports)} SOL across ${data.recipientsCount} wallets`
        );
      } else {
        triggerToast(
          `Synced ${data.memberCount} wallets · Vault ${formatSol(data.vaultBalanceLamports)} SOL`
        );
      }
      fetchLaunches();
      fetchGlobalPayouts();
      if (lookupWalletInput) fetchWalletHub(lookupWalletInput);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setSweepingLaunchId(null);
    }
  };

  const handleLaunch = async () => {
    if (!publicKey || !signTransaction) {
      setLaunchError("Connect your Solana wallet in the top bar to sign the deployment transaction.");
      return;
    }
    if (!selectedSquad) {
      setLaunchError("Select a Pump.fun squad to attach to this deployment.");
      return;
    }
    if (!name.trim() || !symbol.trim()) {
      setLaunchError("Enter both a token Name and Ticker Symbol.");
      return;
    }

    setLaunching(true);
    setLaunchError(null);
    setLaunchResult(null);

    try {
      setLaunchStep("PINNING METADATA & ARTWORK TO IPFS...");
      const form = new FormData();
      form.append("name", name.trim());
      form.append("symbol", symbol.trim().toUpperCase());
      form.append("description", description.trim());
      form.append("twitter", twitter.trim());
      form.append("telegram", telegram.trim());
      form.append("website", website.trim());
      if (imageFile) form.append("image", imageFile);

      const metaRes = await fetch("/api/metadata", { method: "POST", body: form });
      const metaData = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaData.error || "Failed to upload metadata");

      setLaunchStep("INITIALIZING DEDICATED SPLITTER VAULT & FEE CONFIG...");
      const mintKeypair = Keypair.generate();
      const squadBps = Math.round(squadSharePercent * 100);

      const prepRes = await fetch("/api/launches/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint: mintKeypair.publicKey.toBase58(),
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          imageUrl: metaData.imageUrl,
          twitter: twitter.trim(),
          telegram: telegram.trim(),
          website: website.trim(),
          metadataUri: metaData.metadataUri,
          creatorWallet: publicKey.toBase58(),
          squadId: selectedSquad.id,
          squadBps,
          initialBuySol: parseFloat(initialBuySol) || 0,
          roleWeights,
          demoMode,
        }),
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok) throw new Error(prepData.error || "Failed to prepare launch");

      const {
        launchId,
        vaultPublicKey,
        requiresMintSignature,
        instructions: serializedIxs,
      } = prepData;

      setLaunchStep(
        demoMode
          ? "AWAITING WALLET SIGNATURE (DEVNET SPLITTER VAULT FUNDING)..."
          : "AWAITING WALLET SIGNATURE (CREATE_V2 + FEE_SHARING_CONFIG)..."
      );
      const tx = new Transaction();
      for (const item of serializedIxs) {
        tx.add(
          new TransactionInstruction({
            programId: new PublicKey(item.programId),
            keys: item.keys.map((k: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({
              pubkey: new PublicKey(k.pubkey),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
            data: Buffer.from(item.data, "base64"),
          })
        );
      }

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      if (requiresMintSignature !== false) {
        tx.partialSign(mintKeypair);
      }

      const signedTx = await signTransaction(tx);

      setLaunchStep("BROADCASTING TO SOLANA RPC...");
      const createSig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(createSig, "confirmed");

      await fetch("/api/launches/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchId,
          createSig,
          feeConfigSig: createSig,
        }),
      });

      setLaunchResult({
        launchId,
        mint: mintKeypair.publicKey.toBase58(),
        vaultPublicKey,
        createSig,
      });
      triggerToast(`Deployed $${symbol.toUpperCase()} for @${selectedSquad.username}`);
      fetchLaunches();
      fetchLeaderboard(leaderboardPeriod);
    } catch (err: unknown) {
      console.error("Launch error:", err);
      setLaunchError(err instanceof Error ? err.message : "Failed to launch token");
    } finally {
      setLaunching(false);
      setLaunchStep(null);
    }
  };

  const previewAllocations = React.useMemo(() => {
    if (!selectedSquad) return [];
    const totalCreatorFeeSol = estVolumeSol * 0.01;
    const squadPoolLamports = BigInt(Math.round(totalCreatorFeeSol * (squadSharePercent / 100) * 1e9));
    const recipients = selectedSquad.members
      .filter((m) => !!m.walletAddress)
      .map((m) => ({
        walletAddress: m.walletAddress!,
        role: m.role,
        userId: m.userId,
      }));
    return splitLamports(squadPoolLamports, recipients, roleWeights);
  }, [selectedSquad, estVolumeSol, squadSharePercent, roleWeights]);

  const filteredLaunches = React.useMemo(() => {
    return launches
      .filter((l) => {
        if (trenchSquadFilter !== "ALL" && l.squadId !== trenchSquadFilter) return false;
        if (!trenchSearch.trim()) return true;
        const q = trenchSearch.toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          l.symbol.toLowerCase().includes(q) ||
          l.mint.toLowerCase().includes(q) ||
          l.squad.username.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "squad_split") return b.squadBps - a.squadBps;
        if (sortBy === "fees_paid") {
          return Number(BigInt(b.totalDistributedLamports) - BigInt(a.totalDistributedLamports));
        }
        if (sortBy === "roster_size") return b.squad.memberCount - a.squad.memberCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [launches, trenchSearch, trenchSquadFilter, sortBy]);

  const totalDistributedAllLaunches = launches.reduce(
    (acc, l) => acc + BigInt(l.totalDistributedLamports || "0"),
    0n
  );

  const topSquads = leaderboard.slice(0, 3);
  const flagshipLaunch = filteredLaunches[0] || null;

  return (
    <div className="min-h-screen flex flex-col text-[#f8f6ff]">
      {toastMessage && (
        <div className="fixed bottom-10 right-5 z-50 px-4 py-2.5 bg-[#150830] border-2 border-[#d8ff00] shadow-[4px_4px_0px_#05010a] text-xs font-mono font-bold text-[#d8ff00] flex items-center gap-2">
          <PumpCapsuleIcon size={20} angle={-12} />
          <span>{toastMessage}</span>
        </div>
      )}

      <CreateSquadModal
        open={createSquadOpen}
        onClose={() => setCreateSquadOpen(false)}
        connectedWallet={publicKey?.toBase58() || null}
        onCreated={(newSq) => {
          setSelectedSquad(newSq);
          setSquads((prev) => [newSq, ...prev.filter((s) => s.id !== newSq.id)]);
          fetchLeaderboard(leaderboardPeriod);
          triggerToast(`Registered squad @${newSq.username} (${newSq.members.length} wallets)`);
        }}
      />

      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCreateSquad={() => setCreateSquadOpen(true)}
        stats={{
          totalLaunches: launches.length,
          activeSquads: leaderboard.length || squads.length,
          totalDistributedSol: formatSol(totalDistributedAllLaunches),
        }}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-6">
        {/* =========================================================
            TAB 1: SQUAD BOARD
           ========================================================= */}
        {activeTab === "trenches" && (
          <div className="space-y-6">
            {/* 1. SQUADRON HERO & ACTIVE SQUADS DECK */}
            <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-[#351a6b] bg-[#130829] shadow-[6px_6px_0px_#05010a]">
              {/* Left 7 Cols: Royal Violet Hero Banner with Cut-Out Final Logo */}
              <div className="lg:col-span-7 p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-[#351a6b] bg-gradient-to-br from-[#3c09a8] via-[#270673] to-[#140538] relative overflow-hidden flex flex-col justify-between gap-5">
                <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
                  <div className="flex items-center gap-2.5">
                    <span className="squad-badge px-2.5 py-1 bg-[#d8ff00] text-[#090314] border-2 border-[#090314] text-xs shadow-[2px_2px_0px_#090314]">
                      <span>PUMP.FUN SQUAD LAUNCHPAD</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-[#f8f6ff]/90">
                      ON-CHAIN CREATOR FEE SPLITTER
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PumpCapsuleIcon size={24} angle={-12} />
                    <span className="text-xs font-mono font-bold text-[#d8ff00]">
                      10→20+ CAP BYPASS
                    </span>
                  </div>
                </div>

                {flagshipLaunch ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center relative z-10">
                    <div className="sm:col-span-7 flex items-start gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={flagshipLaunch.imageUrl || "/branding/logo-square.jpg"}
                        alt={flagshipLaunch.name}
                        className="w-16 h-16 object-cover border-2 border-[#090314] shadow-[3px_3px_0px_#090314] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="squad-display squad-title-shadow text-2xl text-[#d8ff00] truncate">
                            {flagshipLaunch.name}
                          </h2>
                          <span className="px-2 py-0.5 bg-[#090314] text-[#d8ff00] font-mono text-xs font-black border border-[#d8ff00]">
                            ${flagshipLaunch.symbol}
                          </span>
                        </div>
                        <Link
                          href={`/squads/${encodeURIComponent(flagshipLaunch.squadId)}`}
                          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#24e063] hover:underline mt-1"
                        >
                          <span>SQUAD: @{flagshipLaunch.squad.username}</span>
                          <span className="text-white/80">
                            ({flagshipLaunch.squad.memberCount}/20 WALLETS)
                          </span>
                        </Link>

                        <div className="mt-3">
                          <RosterSlotBar memberCount={flagshipLaunch.squad.memberCount} />
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-5 bg-[#0e0421]/95 border-2 border-[#090314] p-3.5 shadow-[4px_4px_0px_#090314] space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#a594c7] font-bold">SPLITTER VAULT</span>
                        <span className="text-[#24e063] font-bold">
                          {Math.round(flagshipLaunch.squadBps / 100)}% FEE CUT
                        </span>
                      </div>
                      <PillSplitMeter squadPct={Math.round(flagshipLaunch.squadBps / 100)} />
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#a594c7]">PAID TO SQUAD:</span>
                        <span className="text-[#d8ff00] font-bold">
                          {formatSol(flagshipLaunch.totalDistributedLamports)} SOL
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTriggerSweep(flagshipLaunch.id)}
                          disabled={sweepingLaunchId === flagshipLaunch.id}
                          className="btn-volt flex-1 py-1.5 px-3 text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>
                            {sweepingLaunchId === flagshipLaunch.id ? "Syncing..." : "Sweep & Split"}
                          </span>
                        </button>
                        <Link
                          href={`/squads/${encodeURIComponent(flagshipLaunch.squadId)}`}
                          className="p-1.5 bg-[#1c0c3d] border-2 border-[#090314] text-[#d8ff00]"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center relative z-10 py-2">
                    <div className="sm:col-span-7 space-y-3">
                      <h1 className="squad-display squad-title-shadow text-3xl sm:text-4xl text-[#d8ff00] leading-none">
                        COLLABORATIVE SQUAD LAUNCHES
                      </h1>
                      <p className="text-xs sm:text-sm text-white/90 font-medium leading-relaxed max-w-lg">
                        Pick any active <strong className="text-[#d8ff00]">Pump.fun Squad</strong>, pull every member&apos;s wallet automatically, and route creator fees to the entire roster from trade #1.
                      </p>
                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveTab("launch")}
                          className="btn-volt px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                          <span>Launch Squad Coin</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("thesis")}
                          className="px-4 py-2.5 bg-[#13062e] hover:bg-[#1e0b45] text-[#24e063] border-2 border-[#090314] shadow-[3px_3px_0px_#090314] text-xs font-black uppercase tracking-wide cursor-pointer transition whitespace-nowrap"
                        >
                          Why Squadron? (The Thesis) →
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-5 flex flex-col items-center sm:items-end justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/branding/final-logo.png"
                        alt="Squadron"
                        className="w-full max-w-[300px] h-auto object-contain select-none drop-shadow-[4px_4px_0px_#05010a]"
                      />
                    </div>
                  </div>
                )}

                {/* Bottom 20-Slot Overdrive Legend Strip */}
                <div className="pt-3 border-t-2 border-[#090314]/40 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[#24e063] font-bold">
                      <span className="w-2.5 h-2.5 bg-[#24e063] border border-[#090314] inline-block" />
                      SLOTS 1–10: NATIVE PUMPFEES
                    </span>
                    <span className="flex items-center gap-1.5 text-[#d8ff00] font-bold">
                      <span className="w-2.5 h-2.5 bg-[#d8ff00] border border-[#090314] inline-block" />
                      SLOTS 11–20: SPLITTER OVERDRIVE
                    </span>
                  </div>
                  <span className="text-white/80 font-bold">10,000 BPS ON-CHAIN</span>
                </div>
              </div>

              {/* Right 5 Cols: Top Active Pump.fun Squads (with 20-Slot Roster Meters) */}
              <div className="lg:col-span-5 flex flex-col justify-between divide-y-2 divide-[#291552] bg-[#130829]">
                <div className="px-4 py-2.5 bg-[#0d041f] flex items-center justify-between text-xs font-mono">
                  <span className="font-black text-[#d8ff00] uppercase tracking-wider flex items-center gap-2">
                    <PumpCapsuleIcon size={18} angle={0} />
                    <span>TOP ACTIVE PUMP.FUN SQUADS</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("leaderboard")}
                    className="text-[11px] font-bold text-[#24e063] hover:underline cursor-pointer"
                  >
                    ALL {leaderboard.length} SQUADS →
                  </button>
                </div>

                {topSquads.map((sq) => (
                  <div
                    key={sq.id}
                    className="p-4 hover:bg-[#1a0c38] transition-colors space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="squad-badge px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px] border border-[#090314] font-mono">
                            #{sq.rank}
                          </span>
                          <Link
                            href={`/squads/${encodeURIComponent(sq.id)}`}
                            className="text-sm font-black text-[#f8f6ff] hover:text-[#d8ff00] truncate"
                          >
                            @{sq.username}
                          </Link>
                          {sq.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#24e063] shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#a594c7] mt-1 flex items-center gap-2.5">
                          <span className="text-[#f8f6ff] font-bold">
                            {sq.memberCount}/20 WALLETS
                          </span>
                          <span>•</span>
                          <span className="text-[#24e063] font-bold">{sq.repScore} REP</span>
                          {sq.pnlUsd !== undefined && (
                            <>
                              <span>•</span>
                              <span className={sq.pnlUsd >= 0 ? "text-[#d8ff00]" : "text-rose-400"}>
                                {formatCompactUsd(sq.pnlUsd)} PnL
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={`/squads/${encodeURIComponent(sq.id)}`}
                          className="btn-hangar px-2.5 py-1 text-[11px] font-mono"
                        >
                          Roster
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectSquad(sq);
                            setActiveTab("launch");
                          }}
                          className="btn-volt px-2.5 py-1 text-[11px] font-mono cursor-pointer"
                        >
                          + Launch
                        </button>
                      </div>
                    </div>

                    {/* Signature 20-Slot Roster Meter */}
                    <RosterSlotBar memberCount={sq.memberCount} />
                  </div>
                ))}
              </div>
            </div>

            {/* 2. FILTER & VIEW SWITCHER BAR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b-2 border-[#291552]">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#a594c7] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search coin, ticker, mint, or @squad..."
                    value={trenchSearch}
                    onChange={(e) => setTrenchSearch(e.target.value)}
                    className="h-9 pl-8 pr-3 bg-[#130829] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none w-64 shadow-[2px_2px_0px_#05010a]"
                  />
                </div>

                <div className="flex items-center border-2 border-[#291552] bg-[#130829] divide-x-2 divide-[#291552] text-xs font-mono shadow-[2px_2px_0px_#05010a]">
                  {(
                    [
                      { id: "newest", label: "Newest" },
                      { id: "squad_split", label: "Squad %" },
                      { id: "fees_paid", label: "Fees Paid" },
                      { id: "roster_size", label: "Roster" },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSortBy(s.id)}
                      className={`h-8 px-3 font-bold uppercase transition-colors cursor-pointer ${
                        sortBy === s.id
                          ? "bg-[#d8ff00] text-[#090314]"
                          : "text-[#a594c7] hover:text-[#f8f6ff]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <select
                  value={trenchSquadFilter}
                  onChange={(e) => setTrenchSquadFilter(e.target.value)}
                  className="h-9 px-3 bg-[#130829] border-2 border-[#291552] text-xs font-mono font-bold text-[#d8ff00] focus:outline-none focus:border-[#d8ff00] shadow-[2px_2px_0px_#05010a]"
                >
                  <option value="ALL">SQUAD: ALL ({leaderboard.length})</option>
                  {leaderboard.map((sq) => (
                    <option key={sq.id} value={sq.id}>
                      @{sq.username} ({sq.memberCount}/20)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalystOpen(catalystOpen === "SPLITTER" ? null : "SPLITTER")}
                  className={`h-9 px-3 border-2 text-xs font-mono font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-[2px_2px_0px_#05010a] ${
                    catalystOpen === "SPLITTER"
                      ? "bg-[#d8ff00] border-[#090314] text-[#090314]"
                      : "bg-[#130829] border-[#351a6b] text-[#f8f6ff] hover:border-[#d8ff00]"
                  }`}
                >
                  <PumpCapsuleIcon size={18} angle={-10} />
                  <span>10→20+ SPLITTER TEK</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCatalystOpen(catalystOpen === "ROSTER" ? null : "ROSTER")}
                  className={`h-9 px-3 border-2 text-xs font-mono font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-[2px_2px_0px_#05010a] ${
                    catalystOpen === "ROSTER"
                      ? "bg-[#24e063] border-[#090314] text-[#090314]"
                      : "bg-[#130829] border-[#351a6b] text-[#f8f6ff] hover:border-[#24e063]"
                  }`}
                >
                  <span>AUTO-ROSTER SYNC</span>
                </button>

                <div className="flex items-center border-2 border-[#291552] bg-[#130829] divide-x-2 divide-[#291552] shadow-[2px_2px_0px_#05010a]">
                  {(
                    [
                      { id: "grid", icon: <LayoutGrid className="w-3.5 h-3.5" />, title: "Grid" },
                      { id: "trench", icon: <Rows3 className="w-3.5 h-3.5" />, title: "Trench" },
                      { id: "table", icon: <Table2 className="w-3.5 h-3.5" />, title: "Table" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      title={v.title}
                      onClick={() => setViewLayout(v.id)}
                      className={`h-8 w-8 flex items-center justify-center transition-colors cursor-pointer ${
                        viewLayout === v.id
                          ? "bg-[#d8ff00] text-[#090314]"
                          : "text-[#a594c7] hover:text-[#f8f6ff]"
                      }`}
                    >
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {catalystOpen && (
              <div className="p-5 border-2 border-[#d8ff00] bg-[#190a36] shadow-[5px_5px_0px_#05010a] flex flex-col md:flex-row md:items-center justify-between gap-4">
                {catalystOpen === "SPLITTER" ? (
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex items-center gap-2">
                      <span className="squad-badge px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px]">
                        <span>PUMPFEES OVERDRIVE</span>
                      </span>
                      <span className="text-sm font-black text-[#f8f6ff]">
                        Why Every Squad Launch Uses a Dedicated Splitter Vault
                      </span>
                    </div>
                    <p className="text-xs text-[#a594c7] leading-relaxed">
                      Pump.fun&apos;s native fee-sharing caps at <strong className="text-white">10 wallets</strong> and permanently revokes admin authority after the first update. Squadron assigns your squad&apos;s fee cut to a dedicated <strong className="text-[#d8ff00]">Splitter Vault</strong> on-chain at launch, then sweeps and splits SOL pro-rata across all <strong className="text-[#24e063]">20 squad members</strong> on schedule.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex items-center gap-2">
                      <span className="squad-badge px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px]">
                        <span>GRAPH.READ SYNC</span>
                      </span>
                      <span className="text-sm font-black text-[#f8f6ff]">
                        Zero Manual Wallet Registration
                      </span>
                    </div>
                    <p className="text-xs text-[#a594c7] leading-relaxed">
                      Squads never register wallets by hand. Squadron pulls active member wallets directly from <code className="text-white">/v1/groups/&#123;groupId&#125;/members</code> and re-syncs before every payout batch so roster changes are reflected automatically.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab("launch")}
                    className="btn-volt px-4 py-2 text-xs cursor-pointer"
                  >
                    Deploy Squad Coin →
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalystOpen(null)}
                    className="btn-hangar px-3 py-2 text-xs cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* 3. SQUADRON SYNDICATE DIRECTORY (ACTIVE PUMP.FUN SQUADS) */}
            <div className="border-2 border-[#291552] bg-[#130829] shadow-[4px_4px_0px_#05010a]">
              <div className="px-4 py-2.5 border-b-2 border-[#291552] bg-[#0d041f] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-[#d8ff00] font-bold uppercase">
                    ACTIVE PUMP.FUN SQUAD SYNDICATES ({leaderboard.length})
                  </span>
                  <span className="hidden sm:inline text-[#a594c7]">
                    · GREEN = NATIVE 10 CAP · VOLT = 11–20 OVERDRIVE
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateSquadOpen(true)}
                    className="text-[#24e063] font-bold hover:underline cursor-pointer"
                  >
                    + Register Custom 20-Wallet Squad
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("leaderboard")}
                    className="text-[#d8ff00] font-bold hover:underline cursor-pointer"
                  >
                    Full Leaderboard →
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#291552]">
                {leaderboard.slice(0, 8).map((sq) => (
                  <div
                    key={sq.id}
                    className="p-4 hover:bg-[#1a0c38] transition-colors flex flex-col justify-between gap-3 border-b border-[#291552]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <Link
                          href={`/squads/${encodeURIComponent(sq.id)}`}
                          className="text-sm font-black text-[#f8f6ff] hover:text-[#d8ff00] truncate flex items-center gap-1.5"
                        >
                          <span>@{sq.username}</span>
                          {sq.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#24e063] shrink-0" />
                          )}
                        </Link>
                        <span className="px-1.5 py-0.5 bg-[#0b0418] border border-[#291552] text-[10px] font-mono font-bold text-[#d8ff00]">
                          #{sq.rank}
                        </span>
                      </div>
                      <RosterSlotBar memberCount={sq.memberCount} />
                      <div className="text-[11px] font-mono text-[#a594c7] flex items-center justify-between">
                        <span>
                          <strong className="text-white">{sq.memberCount}/20</strong> WALLETS
                        </span>
                        <span className="text-[#24e063] font-bold">{sq.repScore} REP</span>
                        {sq.pnlUsd !== undefined && (
                          <span className={sq.pnlUsd >= 0 ? "text-[#d8ff00] font-bold" : "text-rose-400"}>
                            {formatCompactUsd(sq.pnlUsd)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-[#291552]">
                      <Link
                        href={`/squads/${encodeURIComponent(sq.id)}`}
                        className="btn-hangar flex-1 py-1.5 text-center text-[11px] font-mono"
                      >
                        Inspect Roster
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectSquad(sq);
                          setActiveTab("launch");
                        }}
                        className="btn-volt flex-1 py-1.5 text-[11px] font-mono cursor-pointer"
                      >
                        + Launch Coin
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. SQUADRON TOKEN CARDS (GRID / TRENCH / TABLE) */}
            {loadingLaunches ? (
              <div className="hangar-card p-12 text-center text-xs font-mono text-[#a594c7]">
                LOADING SQUAD DEPLOYMENTS...
              </div>
            ) : filteredLaunches.length === 0 ? (
              <div className="hangar-card p-6 sm:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b-2 border-[#291552]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PumpCapsuleIcon size={24} angle={-12} />
                      <span className="text-xs font-mono uppercase tracking-widest text-[#24e063] font-bold">
                        LIVE SQUAD DEPLOYMENT FEED · READY FOR LAUNCH #1
                      </span>
                    </div>
                    <h3 className="squad-display squad-title-shadow text-2xl sm:text-3xl text-[#d8ff00]">
                      DEPLOY THE FIRST SQUADRON COIN
                    </h3>
                    <p className="text-xs text-[#a594c7] max-w-2xl leading-relaxed">
                      Every coin launched here creates a Token-2022 mint on Pump.fun, locks creator fee-sharing to a dedicated Splitter Vault PDA, and streams SOL pro-rata to all 20 squad member wallets.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("launch")}
                      className="btn-volt px-5 py-2.5 text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Open Launch Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("thesis")}
                      className="btn-hangar px-4 py-2.5 text-xs font-mono cursor-pointer"
                    >
                      Read The Thesis →
                    </button>
                  </div>
                </div>

                {/* 3-Step Visual Blueprint Strip inside the Board */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px] font-black">
                        01 · PICK A SQUAD
                      </span>
                      <span className="text-[#24e063] font-bold">UP TO 20 WALLETS</span>
                    </div>
                    <p className="font-sans text-[#a594c7] leading-relaxed">
                      Click <strong className="text-white">+ Launch Coin</strong> on any Pump.fun Squad above or register your own cabal&apos;s wallets in one click.
                    </p>
                  </div>

                  <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px] font-black">
                        02 · SET CAPSULE SPLIT
                      </span>
                      <span className="text-[#d8ff00] font-bold">10%–100% TO SQUAD</span>
                    </div>
                    <p className="font-sans text-[#a594c7] leading-relaxed">
                      Choose the Squad vs. Creator fee split and role weights (<code className="text-white">OWNER / ADMIN / MEMBER</code>).
                    </p>
                  </div>

                  <div className="p-4 bg-[#0b0418] border-2 border-[#291552] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px] font-black">
                        03 · AUTO-SWEEP &amp; SPLIT
                      </span>
                      <span className="text-[#24e063] font-bold">SOLSCAN VERIFIED</span>
                    </div>
                    <p className="font-sans text-[#a594c7] leading-relaxed">
                      Every coin gets a dedicated <strong className="text-[#d8ff00]">Vault Command Center</strong> with Quick-Buy, Raid Card export, and 1-click multi-wallet payouts.
                    </p>
                  </div>
                </div>
              </div>
            ) : viewLayout === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredLaunches.map((launch) => {
                  const squadCutPct = Math.round(launch.squadBps / 100);
                  const creatorCutPct = Math.round(launch.creatorBps / 100);
                  return (
                    <div
                      key={launch.id}
                      className="hangar-card p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3.5">
                        {/* Top Header: Icon + Ticker + Flying Pill */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3.5 min-w-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={launch.imageUrl || "/branding/final-logo.png"}
                              alt={launch.name}
                              className="w-14 h-14 object-cover border-2 border-[#090314] shadow-[3px_3px_0px_#05010a] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/launches/${encodeURIComponent(launch.id)}`}
                                  className="font-black text-base text-[#f8f6ff] hover:text-[#d8ff00] truncate"
                                >
                                  {launch.name}
                                </Link>
                                <span className="px-1.5 py-0.5 bg-[#d8ff00] text-[#090314] font-mono text-[11px] font-black border border-[#090314]">
                                  ${launch.symbol}
                                </span>
                              </div>
                              <Link
                                href={`/squads/${encodeURIComponent(launch.squadId)}`}
                                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#24e063] hover:underline mt-1"
                              >
                                <span>@{launch.squad.username}</span>
                                <span className="text-[#a594c7]">
                                  ({launch.squad.memberCount}/20w)
                                </span>
                              </Link>
                            </div>
                          </div>

                          <PumpCapsuleIcon size={24} angle={-14} />
                        </div>

                        {/* 20-Slot Roster Capacity Meter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-[#a594c7]">
                            <span>SQUAD ROSTER CAPACITY</span>
                            <span className="text-[#d8ff00] font-bold">
                              {launch.squad.memberCount} ACTIVE WALLETS
                            </span>
                          </div>
                          <RosterSlotBar memberCount={launch.squad.memberCount} />
                        </div>

                        {launch.description && (
                          <p className="text-xs text-[#a594c7] line-clamp-2 leading-relaxed">
                            {launch.description}
                          </p>
                        )}

                        {/* Two-Tone Capsule Fee Split Meter */}
                        <div className="p-3 bg-[#0d041f] border-2 border-[#291552] space-y-2">
                          <div className="flex justify-between text-[11px] font-mono font-bold">
                            <span className="text-[#24e063]">SQUAD VAULT: {squadCutPct}%</span>
                            <span className="text-[#f8f6ff]">CREATOR: {creatorCutPct}%</span>
                          </div>
                          <PillSplitMeter squadPct={squadCutPct} />
                          <div className="flex justify-between text-[11px] font-mono text-[#a594c7] pt-1">
                            <span>
                              ROUTED:{" "}
                              <strong className="text-[#d8ff00]">
                                {formatSol(launch.totalDistributedLamports)} SOL
                              </strong>
                            </span>
                            <span>
                              BATCHES: <strong className="text-white">{launch._count.payouts}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t-2 border-[#291552] flex items-center justify-between gap-2 text-[11px] font-mono">
                        <a
                          href={solscanUrl("account", launch.vault.publicKey)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#a594c7] hover:text-[#d8ff00] inline-flex items-center gap-1"
                        >
                          <span>
                            VAULT {launch.vault.publicKey.slice(0, 4)}..{launch.vault.publicKey.slice(-4)}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTriggerSweep(launch.id)}
                            disabled={sweepingLaunchId === launch.id}
                            className="btn-volt px-2.5 py-1 text-[11px] cursor-pointer"
                          >
                            {sweepingLaunchId === launch.id ? "Syncing..." : "Sweep & Split"}
                          </button>
                          <Link
                            href={`/launches/${encodeURIComponent(launch.id)}`}
                            className="btn-hangar px-2.5 py-1 text-[11px]"
                          >
                            Vault →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : viewLayout === "trench" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLaunches.map((launch) => (
                  <div
                    key={launch.id}
                    className="hangar-card p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={launch.imageUrl || "/branding/final-logo.png"}
                        alt={launch.name}
                        className="w-12 h-12 object-cover border-2 border-[#090314]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/launches/${encodeURIComponent(launch.id)}`}
                            className="font-black text-sm text-[#f8f6ff] hover:text-[#d8ff00] truncate"
                          >
                            {launch.name}
                          </Link>
                          <span className="font-mono text-xs text-[#d8ff00] font-bold">
                            ${launch.symbol}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#24e063]">
                          @{launch.squad.username} · {Math.round(launch.squadBps / 100)}% Squad Split
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                      <div className="text-right mr-1">
                        <div className="text-[#d8ff00] font-bold">
                          {formatSol(launch.totalDistributedLamports)} SOL
                        </div>
                        <div className="text-[10px] text-[#a594c7]">ROUTED</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTriggerSweep(launch.id)}
                        className="btn-volt px-2.5 py-1.5 text-[11px] cursor-pointer"
                      >
                        Sweep
                      </button>
                      <Link
                        href={`/launches/${encodeURIComponent(launch.id)}`}
                        className="btn-hangar px-2.5 py-1.5 text-[11px]"
                      >
                        Vault →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="hangar-card overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b-2 border-[#291552] bg-[#0d041f] text-[11px] text-[#d8ff00] uppercase">
                      <th className="py-3 px-4">COIN</th>
                      <th className="py-3 px-4">SQUAD</th>
                      <th className="py-3 px-4">ROSTER SLOTS</th>
                      <th className="py-3 px-4">FEE SPLIT</th>
                      <th className="py-3 px-4">PAID OUT</th>
                      <th className="py-3 px-4 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#291552]">
                    {filteredLaunches.map((launch) => (
                      <tr key={launch.id} className="hover:bg-[#1a0c38]">
                        <td className="py-3 px-4 font-sans font-black text-[#f8f6ff]">
                          <Link
                            href={`/launches/${encodeURIComponent(launch.id)}`}
                            className="hover:text-[#d8ff00]"
                          >
                            {launch.name}{" "}
                            <span className="font-mono text-[#d8ff00]">${launch.symbol}</span>
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[#24e063] font-bold">
                          <Link href={`/squads/${encodeURIComponent(launch.squadId)}`} className="hover:underline">
                            @{launch.squad.username}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[#f8f6ff]">{launch.squad.memberCount}/20</td>
                        <td className="py-3 px-4 text-[#d8ff00] font-bold">
                          {Math.round(launch.squadBps / 100)}% Squad
                        </td>
                        <td className="py-3 px-4 text-[#24e063] font-bold">
                          {formatSol(launch.totalDistributedLamports)} SOL
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleTriggerSweep(launch.id)}
                            className="btn-volt px-2.5 py-1 text-[11px] cursor-pointer"
                          >
                            Sweep & Split
                          </button>
                          <Link
                            href={`/launches/${encodeURIComponent(launch.id)}`}
                            className="btn-hangar px-2.5 py-1 text-[11px]"
                          >
                            Vault →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 2: DEPLOY COIN (LAUNCH STUDIO)
           ========================================================= */}
        {activeTab === "launch" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-[#351a6b] bg-[#130829] shadow-[6px_6px_0px_#05010a]">
            {/* Left 5 Cols: Squad Selector & Live Payout Simulator */}
            <div className="lg:col-span-5 border-b-2 lg:border-b-0 lg:border-r-2 border-[#351a6b] flex flex-col justify-between divide-y-2 divide-[#351a6b]">
              <div className="p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="squad-display text-base text-[#d8ff00]">
                    01 · SELECT PUMP.FUN SQUAD
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreateSquadOpen(true)}
                    className="btn-hangar px-2.5 py-1 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Users className="w-3 h-3 text-[#24e063]" />
                    <span>+ Register Squad</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#a594c7] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Pump.fun squads (e.g. degen, alpha, sniper)..."
                    value={squadSearch}
                    onChange={(e) => setSquadSearch(e.target.value)}
                    className="w-full h-9 pl-8 pr-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-[#291552] border-2 border-[#291552] bg-[#0b0418]">
                  {loadingSquads ? (
                    <div className="p-6 text-center text-xs font-mono text-[#a594c7]">
                      SCANNING SQUADS...
                    </div>
                  ) : squads.length === 0 ? (
                    <div className="p-6 text-center text-xs font-mono text-[#a594c7]">
                      NO SQUADS MATCH
                    </div>
                  ) : (
                    squads.map((sq) => {
                      const isSelected = selectedSquad?.id === sq.id;
                      return (
                        <button
                          key={sq.id}
                          type="button"
                          onClick={() => handleSelectSquad(sq)}
                          className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[#261154] text-[#f8f6ff] border-l-4 border-l-[#d8ff00]"
                              : "hover:bg-[#160933] text-[#a594c7]"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-black text-[#f8f6ff] flex items-center gap-1.5">
                              <span>@{sq.username}</span>
                              {sq.isVerified && (
                                <CheckCircle2 className="w-3 h-3 text-[#24e063]" />
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#a594c7]">
                              {sq.memberCount}/20 wallets
                              {sq.pnlUsd !== undefined && (
                                <span className="ml-2 text-[#24e063] font-bold">
                                  {formatCompactUsd(sq.pnlUsd)} PnL
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-black ${
                              isSelected
                                ? "bg-[#d8ff00] text-[#090314]"
                                : "bg-[#150830] text-[#a594c7] border border-[#291552]"
                            }`}
                          >
                            {isSelected ? "LOCKED" : "SELECT"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Roster & Per-Member Payout Estimator */}
              <div className="p-5 space-y-4 flex-1 bg-[#0f0521]">
                <div className="flex items-center justify-between">
                  <span className="squad-display text-base text-[#24e063]">
                    02 · ROSTER PAYOUT SIMULATOR
                  </span>
                  {selectedSquad && (
                    <Link
                      href={`/squads/${encodeURIComponent(selectedSquad.id)}`}
                      className="text-xs font-mono font-bold text-[#d8ff00] hover:underline"
                    >
                      @{selectedSquad.username} ({selectedSquad.members.length}/20) →
                    </Link>
                  )}
                </div>

                {loadingSquadDetail ? (
                  <div className="p-8 text-center text-xs font-mono text-[#a594c7]">
                    PULLING SQUAD WALLETS...
                  </div>
                ) : selectedSquad ? (
                  <>
                    <RosterSlotBar memberCount={selectedSquad.members.length} />

                    <div className="p-3.5 border-2 border-[#291552] bg-[#0b0418] space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#a594c7]">SIMULATED COIN VOLUME</span>
                        <span className="text-[#d8ff00] font-bold">
                          {estVolumeSol.toLocaleString()} SOL →{" "}
                          {((estVolumeSol * 0.01 * squadSharePercent) / 100).toFixed(2)} SOL SQUAD POOL
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="10000"
                        step="50"
                        value={estVolumeSol}
                        onChange={(e) => setEstVolumeSol(Number(e.target.value))}
                        className="w-full accent-[#24e063] cursor-pointer"
                      />
                    </div>

                    <div className="max-h-72 overflow-y-auto border-2 border-[#291552] bg-[#0b0418] divide-y divide-[#291552] font-mono text-xs">
                      {selectedSquad.members.map((m, idx) => {
                        const sim = previewAllocations.find((a) => a.walletAddress === m.walletAddress);
                        return (
                          <div
                            key={m.userId || idx}
                            className="px-3 py-2 flex items-center justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-sans font-bold text-[#f8f6ff] truncate">
                                  {m.username || `Member ${idx + 1}`}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 bg-[#1c0c3d] border border-[#45218a] text-[#d8ff00]">
                                  {m.role} ({roleWeights[m.role]}x)
                                </span>
                              </div>
                              <div className="text-[10px] text-[#a594c7]">
                                {m.walletAddress
                                  ? `${m.walletAddress.slice(0, 6)}...${m.walletAddress.slice(-6)}`
                                  : "NO_WALLET"}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[#24e063] font-bold">
                                +{sim ? formatSol(sim.lamports) : "0.00"} SOL
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-[#a594c7]">
                    SELECT A SQUAD ABOVE TO PREVIEW WALLETS
                  </div>
                )}
              </div>
            </div>

            {/* Right 7 Cols: Token Parameters & Two-Tone Pill Split Config */}
            <div className="lg:col-span-7 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-[#291552]">
                <div>
                  <span className="squad-display text-lg text-[#d8ff00]">
                    03 · TOKEN & FEE SPLIT CONFIGURATION
                  </span>
                  <p className="text-xs text-[#a594c7] mt-0.5">
                    Creates Token-2022 mint on Pump.fun and locks on-chain creator fee-sharing to the squad splitter vault.
                  </p>
                </div>

                {/* Execution Mode Switcher (Devnet Vault Test vs Mainnet Pump.fun CPI) */}
                <div className="flex items-center border-2 border-[#291552] bg-[#0b0418] divide-x-2 divide-[#291552] text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setDemoMode(true)}
                    className={`px-2.5 py-1.5 font-bold uppercase cursor-pointer ${
                      demoMode
                        ? "bg-[#24e063] text-[#090314]"
                        : "text-[#a594c7] hover:text-white"
                    }`}
                  >
                    Devnet Vault Test
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoMode(false)}
                    className={`px-2.5 py-1.5 font-bold uppercase cursor-pointer ${
                      !demoMode
                        ? "bg-[#d8ff00] text-[#090314]"
                        : "text-[#a594c7] hover:text-white"
                    }`}
                  >
                    Pump.fun V2 CPI
                  </button>
                </div>
              </div>

              {/* Artwork + Name/Symbol/Lore */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-mono font-bold uppercase text-[#d8ff00]">
                      TOKEN EMBLEM (IPFS)
                    </label>
                    <button
                      type="button"
                      onClick={generateBadgeImage}
                      className="text-[10px] font-mono font-bold text-[#24e063] hover:underline cursor-pointer"
                    >
                      ⚡ Auto-Gen Emblem
                    </button>
                  </div>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#45218a] hover:border-[#d8ff00] bg-[#0b0418] cursor-pointer overflow-hidden relative transition-colors shadow-[3px_3px_0px_#05010a]">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-3 space-y-1">
                        <Upload className="w-5 h-5 text-[#d8ff00] mx-auto" />
                        <div className="text-xs font-black text-[#f8f6ff]">UPLOAD ARTWORK</div>
                        <div className="text-[10px] font-mono text-[#a594c7]">OR CLICK AUTO-GEN</div>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>

                <div className="sm:col-span-8 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono font-bold uppercase text-[#d8ff00] mb-1">
                        TOKEN NAME *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Degen Council Index"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={32}
                        className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono font-bold uppercase text-[#d8ff00] mb-1">
                        TICKER SYMBOL *
                      </label>
                      <input
                        type="text"
                        placeholder="COUNCIL"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        maxLength={13}
                        className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs font-mono font-bold uppercase text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold uppercase text-[#a594c7] mb-1">
                      DESCRIPTION / LORE
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Why is your squad launching this coin?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-2.5 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Socials & Dev Buy */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase text-[#a594c7] mb-1">
                    X / TWITTER
                  </label>
                  <input
                    type="text"
                    placeholder="https://x.com/..."
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase text-[#a594c7] mb-1">
                    TELEGRAM
                  </label>
                  <input
                    type="text"
                    placeholder="https://t.me/..."
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase text-[#a594c7] mb-1">
                    WEBSITE
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#291552] focus:border-[#d8ff00] text-xs text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase text-[#d8ff00] mb-1">
                    {demoMode ? "INITIAL VAULT SEED (SOL)" : "INITIAL DEV BUY (SOL)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={initialBuySol}
                    onChange={(e) => setInitialBuySol(e.target.value)}
                    className="w-full h-9 px-3 bg-[#0b0418] border-2 border-[#45218a] focus:border-[#d8ff00] text-xs font-mono font-bold text-[#d8ff00] focus:outline-none"
                  />
                </div>
              </div>

              {/* Capsule Fee Split & Role Weighting Box */}
              <div className="border-2 border-[#351a6b] bg-[#0b0418] p-4 space-y-4 shadow-[4px_4px_0px_#05010a]">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#f8f6ff] font-bold flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#d8ff00]" />
                      <span>ON-CHAIN CREATOR FEE CAPSULE SPLIT</span>
                    </span>
                    <span className="text-[#d8ff00] font-black">
                      {squadSharePercent}% SQUAD VAULT ({squadSharePercent * 100} BPS)
                    </span>
                  </div>

                  <PillSplitMeter squadPct={squadSharePercent} />

                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={squadSharePercent}
                    onChange={(e) => setSquadSharePercent(Number(e.target.value))}
                    className="w-full accent-[#d8ff00] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-[#a594c7]">
                    <span className="text-[#24e063] font-bold">
                      GREEN SIDE: SQUAD VAULT ({squadSharePercent}%)
                    </span>
                    <span className="text-white font-bold">
                      WHITE SIDE: CREATOR ({100 - squadSharePercent}%)
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t-2 border-[#291552] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-[#a594c7]">
                    INTRA-SQUAD ROLE MULTIPLIERS
                  </span>
                  <div className="flex items-center border-2 border-[#291552] bg-[#130829] divide-x-2 divide-[#291552] text-[11px] font-mono">
                    {(["equal", "tiered", "custom"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePresetChange(p)}
                        className={`px-2.5 py-1 font-bold uppercase transition-colors cursor-pointer ${
                          weightPreset === p
                            ? "bg-[#d8ff00] text-[#090314]"
                            : "text-[#a594c7] hover:text-[#f8f6ff]"
                        }`}
                      >
                        {p === "equal" ? "Equal 1:1:1" : p === "tiered" ? "Tiered 3:2:1" : "Custom"}
                      </button>
                    ))}
                  </div>
                </div>

                {weightPreset === "custom" && (
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                    {(["OWNER", "ADMIN", "MEMBER"] as const).map((role) => (
                      <div key={role} className="p-2 border-2 border-[#291552] bg-[#130829]">
                        <label className="block text-[10px] text-[#a594c7]">{role} WEIGHT</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={roleWeights[role]}
                          onChange={(e) =>
                            setRoleWeights((prev) => ({
                              ...prev,
                              [role]: Math.max(0, Number(e.target.value)),
                            }))
                          }
                          className="w-full bg-transparent text-xs font-bold text-[#d8ff00] focus:outline-none mt-0.5"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {launchStep && (
                <div className="p-3 border-2 border-[#d8ff00] bg-[#190a36] text-xs font-mono font-bold text-[#d8ff00]">
                  ⚡ {launchStep}
                </div>
              )}

              {launchError && (
                <div className="p-3 border-2 border-rose-500 bg-rose-950/60 text-xs font-mono text-rose-200">
                  ERROR: {launchError}
                </div>
              )}

              {launchResult && (
                <div className="p-4 border-2 border-[#24e063] bg-[#092418] text-xs font-mono space-y-2 shadow-[4px_4px_0px_#05010a]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[#24e063] font-black">
                      ✓ DEPLOYED ON-CHAIN WITH SQUAD FEE-SHARING
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/launches/${encodeURIComponent(launchResult.launchId)}`}
                        className="btn-volt px-2.5 py-1 text-[11px]"
                      >
                        Open Vault Command →
                      </Link>
                      <button
                        type="button"
                        onClick={() => setActiveTab("trenches")}
                        className="btn-hangar px-2.5 py-1 text-[11px] cursor-pointer"
                      >
                        Squad Board
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[#f8f6ff]">
                    <span>MINT: {launchResult.mint}</span>
                    <a
                      href={solscanUrl("account", launchResult.mint)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#24e063] hover:underline inline-flex items-center gap-1"
                    >
                      <span>SOLSCAN</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-[#d8ff00]">
                    <span>SPLITTER VAULT: {launchResult.vaultPublicKey}</span>
                    <a
                      href={solscanUrl("account", launchResult.vaultPublicKey)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#d8ff00] hover:underline inline-flex items-center gap-1"
                    >
                      <span>VERIFY VAULT</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleLaunch}
                disabled={launching || !selectedSquad || !name.trim() || !symbol.trim()}
                className="btn-volt w-full h-12 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>
                  {launching
                    ? "BROADCASTING SQUAD DEPLOYMENT..."
                    : selectedSquad
                    ? `LAUNCH $${symbol || "COIN"} WITH @${selectedSquad.username} (${squadSharePercent}% SQUAD SPLIT)`
                    : "SELECT A SQUAD TO LAUNCH"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: SQUAD REP & LEADERBOARD HUB
           ========================================================= */}
        {activeTab === "leaderboard" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#291552]">
              <div>
                <h1 className="squad-display squad-title-shadow text-2xl text-[#d8ff00]">
                  SQUADRON LEADERBOARD & REP INDEX
                </h1>
                <p className="text-xs text-[#a594c7]">
                  Pump.fun squads ranked by collaborative Reputation Score, 20-slot roster fill, and SOL fees routed to members.
                </p>
              </div>

              <div className="flex items-center border-2 border-[#291552] bg-[#130829] divide-x-2 divide-[#291552] text-xs font-mono shadow-[2px_2px_0px_#05010a]">
                {(["daily", "weekly", "monthly"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLeaderboardPeriod(p)}
                    className={`h-8 px-3 font-bold uppercase transition-colors cursor-pointer ${
                      leaderboardPeriod === p
                        ? "bg-[#d8ff00] text-[#090314]"
                        : "text-[#a594c7] hover:text-[#f8f6ff]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="hangar-card overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b-2 border-[#291552] bg-[#0d041f] text-[11px] text-[#d8ff00] uppercase">
                    <th className="py-3.5 px-4">RANK</th>
                    <th className="py-3.5 px-4">SQUAD</th>
                    <th className="py-3.5 px-4">REP SCORE</th>
                    <th className="py-3.5 px-4 w-52">20-SLOT ROSTER CAPACITY</th>
                    <th className="py-3.5 px-4">LAUNCHES</th>
                    <th className="py-3.5 px-4">FEES ROUTED</th>
                    <th className="py-3.5 px-4">PUMP.FUN PNL</th>
                    <th className="py-3.5 px-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#291552]">
                  {loadingLeaderboard ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#a594c7]">
                        INDEXING SQUADS...
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((sq) => (
                      <tr key={sq.id} className="hover:bg-[#1a0c38] transition-colors">
                        <td className="py-3.5 px-4 font-black text-[#d8ff00]">#{sq.rank}</td>
                        <td className="py-3.5 px-4 font-sans font-black text-[#f8f6ff]">
                          <Link
                            href={`/squads/${encodeURIComponent(sq.id)}`}
                            className="hover:text-[#d8ff00] inline-flex items-center gap-1.5"
                          >
                            <span>@{sq.username}</span>
                            {sq.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[#24e063]" />}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="squad-badge px-2 py-0.5 bg-[#24e063] text-[#090314] text-[10px]">
                            <span>{sq.repScore.toLocaleString()} REP</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <RosterSlotBar memberCount={sq.memberCount} />
                            <div className="text-[10px] text-[#a594c7]">
                              {sq.memberCount}/20 WALLETS{" "}
                              {sq.memberCount > 10 && (
                                <span className="text-[#d8ff00] font-bold">· OVERDRIVE</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[#f8f6ff] font-bold">{sq.launchesCount}</span>{" "}
                          <span className="text-[#a594c7]">({sq.liveLaunchesCount} live)</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[#d8ff00]">
                          {formatSol(sq.feesDistributedLamports)} SOL
                        </td>
                        <td className="py-3.5 px-4">
                          {sq.pnlUsd !== undefined ? (
                            <span className={sq.pnlUsd >= 0 ? "text-[#24e063] font-bold" : "text-rose-400"}>
                              {formatCompactUsd(sq.pnlUsd)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <Link
                            href={`/squads/${encodeURIComponent(sq.id)}`}
                            className="btn-hangar px-2.5 py-1 text-[11px]"
                          >
                            Inspect
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectSquad(sq);
                              setActiveTab("launch");
                            }}
                            className="btn-volt px-2.5 py-1 text-[11px] cursor-pointer"
                          >
                            + Launch
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: SPLITTER PAY & MEMBER CLAIMS
           ========================================================= */}
        {activeTab === "earnings" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#291552]">
              <div>
                <h1 className="squad-display squad-title-shadow text-2xl text-[#d8ff00]">
                  SPLITTER PAY & MEMBER CLAIMS LEDGER
                </h1>
                <p className="text-xs text-[#a594c7]">
                  Live protocol-wide Splitter Vault balances, on-chain payout batches, and individual member wallet claim inspection.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Inspect member wallet address..."
                  value={lookupWalletInput}
                  onChange={(e) => setLookupWalletInput(e.target.value)}
                  className="h-9 px-3 bg-[#130829] border-2 border-[#291552] focus:border-[#d8ff00] text-xs font-mono text-[#f8f6ff] placeholder-[#634f8c] focus:outline-none w-64 sm:w-72"
                />
                <button
                  type="button"
                  onClick={() => fetchWalletHub(lookupWalletInput.trim())}
                  className="btn-volt h-9 px-3.5 text-xs font-mono cursor-pointer shrink-0"
                >
                  Inspect Wallet
                </button>
              </div>
            </div>

            {/* 1. AUTO-SWEEPER DAEMON & PROTOCOL ENGINE PANEL */}
            <AutoSweeperPanel
              onSweepCompleted={() => {
                fetchLaunches();
                fetchGlobalPayouts();
                if (lookupWalletInput) fetchWalletHub(lookupWalletInput);
              }}
            />

            {/* 2. GLOBAL PROTOCOL SPLITTER TELEMETRY STRIP */}
            {globalPayouts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 border-2 border-[#291552] bg-[#130829] divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-[#291552] font-mono shadow-[4px_4px_0px_#05010a]">
                <div className="p-4">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    ACTIVE SPLITTER VAULTS
                  </span>
                  <span className="text-2xl font-black text-[#f8f6ff] mt-1 block">
                    {globalPayouts.stats.activeVaultsCount} VAULTS
                  </span>
                </div>
                <div className="p-4">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    READY TO SPLIT IN VAULTS
                  </span>
                  <span className="text-2xl font-black text-[#d8ff00] mt-1 block">
                    {formatSol(globalPayouts.stats.totalPendingInVaultsLamports)} SOL
                  </span>
                </div>
                <div className="p-4">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    TOTAL ROUTED TO MEMBERS
                  </span>
                  <span className="text-2xl font-black text-[#24e063] mt-1 block">
                    {formatSol(globalPayouts.stats.totalDistributedLamports)} SOL
                  </span>
                </div>
                <div className="p-4">
                  <span className="text-[10px] text-[#a594c7] uppercase block">
                    SETTLED PAYOUT BATCHES
                  </span>
                  <span className="text-2xl font-black text-[#d8ff00] mt-1 block">
                    {globalPayouts.stats.totalBatchesCount} TXS
                  </span>
                </div>
              </div>
            )}

            {/* 2. WALLET INSPECTOR RESULTS (WHEN A WALLET IS SELECTED) */}
            {lookupWalletInput && (
              <div className="space-y-4">
                {loadingWallet ? (
                  <div className="hangar-card p-8 text-center text-xs font-mono text-[#a594c7]">
                    QUERYING WALLET POSITIONS & PENDING SHARES...
                  </div>
                ) : walletData ? (
                  <div className="border-2 border-[#d8ff00] bg-[#150830] p-5 space-y-4 shadow-[5px_5px_0px_#05010a]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#291552] font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="squad-badge px-2 py-0.5 bg-[#d8ff00] text-[#090314] text-[10px]">
                          <span>WALLET INSPECTOR</span>
                        </span>
                        <a
                          href={solscanUrl("account", walletData.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#f8f6ff] font-bold hover:text-[#d8ff00] inline-flex items-center gap-1"
                        >
                          <span>{walletData.address}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-4">
                        <span>
                          EARNED:{" "}
                          <strong className="text-[#24e063]">
                            {formatSol(walletData.totalEarnedLamports)} SOL
                          </strong>
                        </span>
                        <span>
                          CLAIMABLE:{" "}
                          <strong className="text-[#d8ff00]">
                            {formatSol(walletData.claimableLamportsTotal)} SOL
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setLookupWalletInput("");
                            setWalletData(null);
                          }}
                          className="text-[#a594c7] hover:text-white cursor-pointer"
                        >
                          [Clear]
                        </button>
                      </div>
                    </div>

                    {walletData.squadPositions.length === 0 ? (
                      <div className="text-xs font-mono text-[#a594c7]">
                        No active squad positions indexed for this wallet yet. Add this wallet to a squad roster or click any member wallet below to inspect it.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {walletData.squadPositions.map((pos) => (
                          <div
                            key={pos.squadId}
                            className="p-3.5 border-2 border-[#291552] bg-[#0b0418] space-y-2.5 font-mono text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <Link
                                href={`/squads/${encodeURIComponent(pos.squadId)}`}
                                className="font-black text-[#d8ff00] hover:underline"
                              >
                                @{pos.squadUsername}
                              </Link>
                              <span className="px-1.5 py-0.5 bg-[#1c0c3d] border border-[#45218a] text-[10px] text-[#24e063]">
                                {pos.role} · {pos.memberCount}/20w
                              </span>
                            </div>
                            {pos.launches.map((l) => (
                              <div
                                key={l.id}
                                className="p-2.5 bg-[#130829] border border-[#291552] flex items-center justify-between gap-2"
                              >
                                <div>
                                  <Link
                                    href={`/launches/${encodeURIComponent(l.id)}`}
                                    className="font-bold text-[#f8f6ff] hover:text-[#d8ff00]"
                                  >
                                    {l.name} (${l.symbol})
                                  </Link>
                                  <div className="text-[10px] text-[#24e063]">
                                    PENDING SHARE: +{formatSol(l.myPendingShareLamports)} SOL
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleTriggerSweep(l.id)}
                                  className="btn-volt px-2.5 py-1 text-[10px] cursor-pointer"
                                >
                                  Sweep & Split
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* 3. LIVE SPLITTER VAULTS & GLOBAL PAYOUT STREAM */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Active Splitter Vaults */}
              <div className="lg:col-span-7 hangar-card overflow-x-auto">
                <div className="px-4 py-3 border-b-2 border-[#291552] bg-[#0d041f] flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                  <span className="font-bold text-[#d8ff00]">
                    LIVE SPLITTER VAULTS ({globalPayouts?.vaults.length ?? 0})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSweepAllVaults}
                      disabled={sweepingAll}
                      className="btn-volt px-2.5 py-1 text-[10px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Zap className="w-3 h-3" />
                      <span>
                        {sweepingAll ? "Sweeping All Vaults..." : "Sweep All Active Vaults"}
                      </span>
                    </button>
                  </div>
                </div>

                {loadingGlobalPayouts && !globalPayouts ? (
                  <div className="p-8 text-center font-mono text-xs text-[#a594c7]">
                    INDEXING ON-CHAIN SPLITTER VAULTS...
                  </div>
                ) : !globalPayouts || globalPayouts.vaults.length === 0 ? (
                  <div className="p-8 text-center space-y-3 font-mono text-xs text-[#a594c7]">
                    <div>NO SPLITTER VAULTS INITIALIZED YET</div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("launch")}
                      className="btn-volt px-4 py-2 text-xs cursor-pointer"
                    >
                      Launch First Squad Coin →
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#291552] bg-[#0b0418] text-[10px] text-[#a594c7] uppercase">
                        <th className="py-2.5 px-4">COIN / SQUAD</th>
                        <th className="py-2.5 px-4">VAULT PDA</th>
                        <th className="py-2.5 px-4">VAULT BAL</th>
                        <th className="py-2.5 px-4">PAID OUT</th>
                        <th className="py-2.5 px-4 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#291552]">
                      {globalPayouts.vaults.map((v) => (
                        <tr key={v.launchId} className="hover:bg-[#1a0c38]">
                          <td className="py-3 px-4">
                            <Link
                              href={`/launches/${encodeURIComponent(v.launchId)}`}
                              className="font-sans font-black text-[#f8f6ff] hover:text-[#d8ff00] block"
                            >
                              {v.name}{" "}
                              <span className="font-mono text-[#d8ff00]">${v.symbol}</span>
                            </Link>
                            <Link
                              href={`/squads/${encodeURIComponent(v.squadId)}`}
                              className="text-[11px] text-[#24e063] hover:underline"
                            >
                              @{v.squadUsername} ({v.memberCount}/20w · {Math.round(v.squadBps / 100)}%)
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <a
                              href={solscanUrl("account", v.vaultPublicKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#a594c7] hover:text-[#d8ff00] inline-flex items-center gap-1"
                            >
                              <span>
                                {v.vaultPublicKey.slice(0, 4)}..{v.vaultPublicKey.slice(-4)}
                              </span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-3 px-4 font-bold text-[#d8ff00]">
                            {formatSol(v.vaultBalanceLamports)} SOL
                          </td>
                          <td className="py-3 px-4 font-bold text-[#24e063]">
                            {formatSol(v.totalPaidLamports)} SOL
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleTriggerSweep(v.launchId)}
                              disabled={sweepingLaunchId === v.launchId}
                              className="btn-volt px-2.5 py-1 text-[10px] cursor-pointer"
                            >
                              {sweepingLaunchId === v.launchId ? "Splitting..." : "Sweep & Split"}
                            </button>
                            <Link
                              href={`/launches/${encodeURIComponent(v.launchId)}`}
                              className="btn-hangar px-2 py-1 text-[10px]"
                            >
                              Vault →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Right 5 Cols: Recent On-Chain Member Transfers & Batch Receipts */}
              <div className="lg:col-span-5 hangar-card overflow-x-auto">
                <div className="px-4 py-3 border-b-2 border-[#291552] bg-[#0d041f] flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-[#24e063]">
                    RECENT MEMBER PAYOUT TRANSFERS ({globalPayouts?.recentPayouts.length ?? 0})
                  </span>
                  <span className="text-[10px] text-[#a594c7]">CLICK WALLET TO INSPECT</span>
                </div>

                {!globalPayouts || globalPayouts.recentPayouts.length === 0 ? (
                  <div className="p-8 text-center font-mono text-xs text-[#a594c7]">
                    No SOL transfers recorded yet. Deposit test SOL into any coin&apos;s Vault and click &ldquo;Sweep &amp; Split&rdquo; to watch live member payouts stream here.
                  </div>
                ) : (
                  <div className="divide-y divide-[#291552] font-mono text-xs max-h-[460px] overflow-y-auto">
                    {globalPayouts.recentPayouts.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 hover:bg-[#1a0c38] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#24e063]">
                              +{formatSol(p.lamports)} SOL
                            </span>
                            <span className="text-[#d8ff00] font-bold">${p.coinSymbol}</span>
                            <span className="text-[10px] text-[#a594c7]">
                              @{p.squadUsername}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setLookupWalletInput(p.walletAddress);
                              fetchWalletHub(p.walletAddress);
                            }}
                            className="text-[11px] text-[#a594c7] hover:text-[#d8ff00] cursor-pointer mt-0.5"
                          >
                            → {p.walletAddress.slice(0, 6)}...{p.walletAddress.slice(-6)}
                          </button>
                        </div>

                        {p.signature ? (
                          <a
                            href={solscanUrl("tx", p.signature)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-hangar px-2 py-1 text-[10px] inline-flex items-center gap-1 text-[#d8ff00] shrink-0"
                          >
                            <span>TX</span>
                            <ExternalLink className="w-2.5 h-2.5" />
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
          </div>
        )}

        {/* =========================================================
            TAB 5: THE THESIS & ARCHITECTURE MANIFESTO
           ========================================================= */}
        {activeTab === "thesis" && (
          <ThesisSection
            onLaunchClick={() => setActiveTab("launch")}
            onRegisterSquadClick={() => setCreateSquadOpen(true)}
          />
        )}
      </main>

      {/* SQUADRON TELEMETRY FOOTER */}
      <footer className="h-9 border-t-2 border-[#291552] bg-[#0b0418] px-4 flex items-center justify-between text-[11px] font-mono text-[#a594c7]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#24e063] font-bold">
            <PumpCapsuleIcon size={16} angle={-10} />
            SQUADRON SPLITTER ONLINE
          </span>
          <span className="hidden sm:inline text-[#634f8c]">
            PUMPFEES: pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#24e063]">1–10 NATIVE</span>
          <span className="text-[#d8ff00]">11–20 OVERDRIVE VAULT</span>
          <span className="px-1.5 py-0.5 bg-[#1c0c3d] border border-[#45218a] text-[#d8ff00] font-bold">
            {process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.toUpperCase() || "DEVNET"}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0418] flex items-center justify-center text-xs font-mono text-[#d8ff00]">
          LOADING SQUADRON...
        </div>
      }
    >
      <HubContent />
    </Suspense>
  );
}
