import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK } from "@pump-fun/pump-sdk";
import bs58 from "bs58";
import { prisma } from "../src/lib/prisma";
import { loadVaultKeypair } from "../src/lib/vault";
import { getSquadProvider } from "../src/lib/squads";
import { splitLamports, RoleWeights, EQUAL_WEIGHTS } from "../src/lib/split";

const RPC_URL = process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");
const onlineSdk = new OnlinePumpSdk(connection);

const MIN_PAYOUT_LAMPORTS = BigInt(process.env.MIN_PAYOUT_LAMPORTS || "5000000"); // 0.005 SOL
const RENT_EXEMPTION_RESERVE = 1_000_000n; // 0.001 SOL reserve for rent/fees

function getWorkerPayer(): Keypair | null {
  const secret = process.env.WORKER_PAYER_SECRET;
  if (!secret) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch (err) {
    console.error("Invalid WORKER_PAYER_SECRET base58 format:", err);
    return null;
  }
}

/**
 * 1. Re-sync rosters for all squads that have active launches.
 */
export async function syncSquadRosters() {
  console.log("--> [Worker] Starting squad roster sync...");
  const activeLaunches = await prisma.launch.findMany({
    where: { status: "LIVE" },
    select: { squadId: true },
    distinct: ["squadId"],
  });

  const provider = await getSquadProvider();

  for (const { squadId } of activeLaunches) {
    try {
      const squadDetail = await provider.getSquad(squadId);
      if (!squadDetail) continue;

      await prisma.squad.update({
        where: { id: squadId },
        data: {
          username: squadDetail.username,
          memberCount: squadDetail.memberCount,
          syncedAt: new Date(),
        },
      });

      // Mark members missing from new roster as inactive
      const activeUserIds = squadDetail.members.map((m) => m.userId);
      await prisma.member.updateMany({
        where: { squadId, userId: { notIn: activeUserIds } },
        data: { active: false },
      });

      // Upsert current members
      for (const m of squadDetail.members) {
        if (!m.walletAddress) continue;
        await prisma.member.upsert({
          where: { squadId_userId: { squadId, userId: m.userId } },
          create: {
            squadId,
            userId: m.userId,
            username: m.username,
            walletAddress: m.walletAddress,
            role: m.role,
            active: true,
            syncedAt: new Date(),
          },
          update: {
            username: m.username,
            walletAddress: m.walletAddress,
            role: m.role,
            active: true,
            syncedAt: new Date(),
          },
        });
      }
      console.log(`[Worker] Synced roster for squad ${squadDetail.username} (${squadDetail.members.length} members)`);
    } catch (err) {
      console.error(`[Worker] Failed to sync roster for squad ${squadId}:`, err);
    }
  }
}

/**
 * 2. Sweep accrued creator fees & distribute from bonding curve / AMM to vault.
 */
export async function sweepAndDistributeFees() {
  console.log("--> [Worker] Checking fees to sweep and distribute...");
  const payer = getWorkerPayer();
  if (!payer) {
    console.log("[Worker] No WORKER_PAYER_SECRET configured; skipping on-chain sweep execution.");
    return;
  }

  const launches = await prisma.launch.findMany({
    where: { status: "LIVE" },
    include: { vault: true },
  });

  for (const launch of launches) {
    try {
      const mintPubkey = new PublicKey(launch.mint);
      
      // Build instructions using OnlinePumpSdk helper
      // This automatically sweeps fees if pending and routes to sharing config shareholders
      const { instructions } = await onlineSdk.buildDistributeCreatorFeesInstructions(mintPubkey, {
        payer: payer.publicKey,
      });

      if (!instructions || instructions.length === 0) continue;

      const tx = new Transaction().add(...instructions);
      const signature = await connection.sendTransaction(tx, [payer]);
      await connection.confirmTransaction(signature, "confirmed");

      await prisma.sweep.create({
        data: {
          launchId: launch.id,
          signature,
          lamports: 0n, // Accrued on-chain
        },
      });
      console.log(`[Worker] Distributed fees for mint ${launch.symbol} (${launch.mint}): ${signature}`);
    } catch (err) {
      console.error(`[Worker] Sweep failed for mint ${launch.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * 3. Inspect custodial vault balances and payout pro-rata to active squad members.
 */
export async function splitVaultBalances() {
  console.log("--> [Worker] Checking squad vault balances for member payouts...");
  const launches = await prisma.launch.findMany({
    where: { status: "LIVE" },
    include: {
      vault: true,
      squad: {
        include: {
          members: { where: { active: true } },
        },
      },
    },
  });

  let roleWeights: RoleWeights = EQUAL_WEIGHTS;
  if (process.env.ROLE_WEIGHTS) {
    try {
      roleWeights = JSON.parse(process.env.ROLE_WEIGHTS);
    } catch {}
  }

  for (const launch of launches) {
    try {
      const vaultKeypair = loadVaultKeypair(launch.vault.encryptedSecret);
      const balance = await connection.getBalance(vaultKeypair.publicKey);
      const totalLamports = BigInt(balance);

      if (totalLamports <= RENT_EXEMPTION_RESERVE + MIN_PAYOUT_LAMPORTS) {
        // Balance too low to distribute
        continue;
      }

      const distributable = totalLamports - RENT_EXEMPTION_RESERVE;
      const activeMembers = launch.squad.members.map((m) => ({
        walletAddress: m.walletAddress,
        role: m.role as "OWNER" | "ADMIN" | "MEMBER",
        userId: m.userId,
      }));

      if (activeMembers.length === 0) continue;

      let launchWeights: RoleWeights = roleWeights;
      if (launch.roleWeightsJson) {
        try {
          launchWeights = JSON.parse(launch.roleWeightsJson);
        } catch {}
      }

      const allocations = splitLamports(distributable, activeMembers, launchWeights);
      if (allocations.length === 0) continue;

      const batchId = `batch_${Date.now()}`;
      console.log(`[Worker] Distributing ${distributable} lamports to ${allocations.length} members for ${launch.symbol}...`);

      // Build Solana transfer transaction
      const tx = new Transaction();
      for (const alloc of allocations) {
        if (alloc.lamports <= 0n) continue;
        tx.add(
          SystemProgram.transfer({
            fromPubkey: vaultKeypair.publicKey,
            toPubkey: new PublicKey(alloc.walletAddress),
            lamports: Number(alloc.lamports),
          })
        );
      }

      const signature = await connection.sendTransaction(tx, [vaultKeypair]);
      await connection.confirmTransaction(signature, "confirmed");

      // Record in ledger
      for (const alloc of allocations) {
        await prisma.payout.create({
          data: {
            launchId: launch.id,
            batchId,
            walletAddress: alloc.walletAddress,
            userId: alloc.userId,
            lamports: alloc.lamports,
            signature,
            status: "SENT",
          },
        });
      }
      console.log(`[Worker] Payout batch ${batchId} confirmed with tx: ${signature}`);
    } catch (err) {
      console.error(`[Worker] Failed vault distribution for launch ${launch.name}:`, err);
    }
  }
}

export async function runWorkerCycle() {
  console.log(`\n========================================`);
  console.log(`[Worker Cycle] Starting at ${new Date().toISOString()}`);
  await syncSquadRosters();
  await sweepAndDistributeFees();
  await splitVaultBalances();
  console.log(`[Worker Cycle] Completed.\n`);
}
