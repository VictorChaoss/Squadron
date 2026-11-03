import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { splitLamports, RoleWeights, EQUAL_WEIGHTS } from "@/lib/split";

const RPC_URL = process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const RENT_EXEMPTION_RESERVE = 1_000_000n;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!address) {
    return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
  }

  try {
    // 1. Memberships for this wallet
    const memberships = await prisma.member.findMany({
      where: { walletAddress: address, active: true },
      include: {
        squad: {
          include: {
            members: { where: { active: true } },
            launches: {
              include: {
                vault: { select: { publicKey: true } },
              },
            },
          },
        },
      },
    });

    // 2. Launches created by this wallet
    const createdLaunches = await prisma.launch.findMany({
      where: { creatorWallet: address },
      include: {
        squad: true,
        vault: { select: { publicKey: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Historical payouts sent to this wallet
    const payouts = await prisma.payout.findMany({
      where: { walletAddress: address },
      include: {
        launch: {
          select: { name: true, symbol: true, mint: true, squadId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const totalEarnedLamports = payouts
      .filter((p) => p.status === "SENT")
      .reduce((acc, p) => acc + p.lamports, 0n);

    // 4. Calculate claimable / pending share in each active squad vault
    const conn = new Connection(RPC_URL, "confirmed");
    let claimableLamportsTotal = 0n;

    const squadPositions = await Promise.all(
      memberships.map(async (m) => {
        const squadLaunches = await Promise.all(
          m.squad.launches.map(async (l) => {
            let vaultBalance = 0;
            try {
              vaultBalance = await conn.getBalance(new PublicKey(l.vault.publicKey));
            } catch {
              vaultBalance = 0;
            }
            const dist = BigInt(vaultBalance) > RENT_EXEMPTION_RESERVE
              ? BigInt(vaultBalance) - RENT_EXEMPTION_RESERVE
              : 0n;

            let weights: RoleWeights = EQUAL_WEIGHTS;
            try {
              weights = JSON.parse(l.roleWeightsJson);
            } catch {}

            const allocations = splitLamports(
              dist,
              m.squad.members.map((mem) => ({
                walletAddress: mem.walletAddress,
                role: mem.role as "OWNER" | "ADMIN" | "MEMBER",
                userId: mem.userId,
              })),
              weights
            );
            const myAlloc = allocations.find((a) => a.walletAddress === address)?.lamports ?? 0n;
            claimableLamportsTotal += myAlloc;

            return {
              id: l.id,
              mint: l.mint,
              name: l.name,
              symbol: l.symbol,
              squadBps: l.squadBps,
              status: l.status,
              vaultPublicKey: l.vault.publicKey,
              vaultBalanceLamports: vaultBalance.toString(),
              myPendingShareLamports: myAlloc.toString(),
            };
          })
        );

        return {
          squadId: m.squad.id,
          squadUsername: m.squad.username,
          role: m.role,
          memberCount: m.squad.memberCount,
          launches: squadLaunches,
        };
      })
    );

    return NextResponse.json({
      address,
      totalEarnedLamports: totalEarnedLamports.toString(),
      claimableLamportsTotal: claimableLamportsTotal.toString(),
      squadPositions,
      createdLaunches,
      payouts: payouts.map((p) => ({
        ...p,
        lamports: p.lamports.toString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch wallet earnings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
