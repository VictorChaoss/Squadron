import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { splitLamports, RoleWeights, EQUAL_WEIGHTS } from "@/lib/split";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";
const RENT_EXEMPTION_RESERVE = 1_500_000n;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: {
        vault: { select: { publicKey: true, createdAt: true } },
        squad: {
          include: {
            members: {
              where: { active: true },
              orderBy: { role: "asc" },
            },
          },
        },
        payouts: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        sweeps: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!launch) {
      return NextResponse.json({ error: "Launch not found" }, { status: 404 });
    }

    // Query live on-chain vault balance
    let vaultBalanceLamports = 0n;
    try {
      const conn = new Connection(RPC_URL, "confirmed");
      if (launch.vault?.publicKey) {
        const bal = await conn.getBalance(new PublicKey(launch.vault.publicKey));
        vaultBalanceLamports = BigInt(bal);
      }
    } catch {
      vaultBalanceLamports = 0n;
    }

    const distributableLamports =
      vaultBalanceLamports > RENT_EXEMPTION_RESERVE
        ? vaultBalanceLamports - RENT_EXEMPTION_RESERVE
        : 0n;

    // Protocol fee preview
    const platformFeeBps = BigInt(
      launch.platformBps || Number(process.env.PLATFORM_FEE_BPS || 0)
    );
    const protocolFeeLamports =
      platformFeeBps > 0n ? (distributableLamports * platformFeeBps) / 10_000n : 0n;
    const netSquadDistributable = distributableLamports - protocolFeeLamports;

    let weights: RoleWeights = EQUAL_WEIGHTS;
    try {
      weights = JSON.parse(launch.roleWeightsJson);
    } catch {}

    const activeMembers = launch.squad.members;
    const pendingAllocations = splitLamports(
      netSquadDistributable,
      activeMembers.map((m) => ({
        walletAddress: m.walletAddress,
        role: m.role as "OWNER" | "ADMIN" | "MEMBER",
        userId: m.userId,
      })),
      weights
    );

    // Compute per-member historical totals + pending share
    const memberBreakdown = activeMembers.map((m) => {
      const paidTotal = launch.payouts
        .filter((p) => p.walletAddress === m.walletAddress && p.status === "SENT")
        .reduce((acc, p) => acc + p.lamports, 0n);

      const pendingObj = pendingAllocations.find(
        (a) => a.walletAddress === m.walletAddress
      );

      return {
        userId: m.userId,
        username: m.username,
        walletAddress: m.walletAddress,
        role: m.role,
        weight: weights[m.role as "OWNER" | "ADMIN" | "MEMBER"] ?? 1,
        pendingLamports: (pendingObj?.lamports ?? 0n).toString(),
        paidLamports: paidTotal.toString(),
      };
    });

    const totalDistributedLamports = launch.payouts
      .filter((p) => p.status === "SENT")
      .reduce((acc, p) => acc + p.lamports, 0n);

    // Group payouts by batchId for batch receipt view
    const batchesMap = new Map<
      string,
      {
        batchId: string;
        signature: string | null;
        createdAt: string;
        totalLamports: bigint;
        recipientsCount: number;
      }
    >();

    for (const p of launch.payouts) {
      const existing = batchesMap.get(p.batchId);
      if (existing) {
        existing.totalLamports += p.lamports;
        existing.recipientsCount += 1;
      } else {
        batchesMap.set(p.batchId, {
          batchId: p.batchId,
          signature: p.signature,
          createdAt: p.createdAt.toISOString(),
          totalLamports: p.lamports,
          recipientsCount: 1,
        });
      }
    }

    const batches = Array.from(batchesMap.values()).map((b) => ({
      ...b,
      totalLamports: b.totalLamports.toString(),
    }));

    return NextResponse.json({
      launch: {
        id: launch.id,
        mint: launch.mint,
        name: launch.name,
        symbol: launch.symbol,
        description: launch.description,
        imageUrl: launch.imageUrl,
        twitter: launch.twitter,
        telegram: launch.telegram,
        website: launch.website,
        metadataUri: launch.metadataUri,
        creatorWallet: launch.creatorWallet,
        squadId: launch.squadId,
        squadBps: launch.squadBps,
        creatorBps: launch.creatorBps,
        platformBps: launch.platformBps,
        initialBuySol: launch.initialBuySol,
        roleWeightsJson: launch.roleWeightsJson,
        status: launch.status,
        createSig: launch.createSig,
        createdAt: launch.createdAt.toISOString(),
        squad: {
          id: launch.squad.id,
          username: launch.squad.username,
          memberCount: activeMembers.length,
          profileImageUrl: launch.squad.profileImageUrl,
        },
        vault: {
          publicKey: launch.vault?.publicKey || "",
          balanceLamports: vaultBalanceLamports.toString(),
          distributableLamports: netSquadDistributable.toString(),
          protocolFeeLamports: protocolFeeLamports.toString(),
        },
        totalDistributedLamports: totalDistributedLamports.toString(),
        memberBreakdown,
        batches,
        payouts: launch.payouts.map((p) => ({
          id: p.id,
          batchId: p.batchId,
          walletAddress: p.walletAddress,
          userId: p.userId,
          lamports: p.lamports.toString(),
          signature: p.signature,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/launches/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load launch details" },
      { status: 500 }
    );
  }
}
