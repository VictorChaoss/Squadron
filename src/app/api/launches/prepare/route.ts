import { NextResponse } from "next/server";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { prisma, ensureDbSchema, encodeStatelessLaunchId } from "@/lib/prisma";
import { getSquadProvider } from "@/lib/squads";
import { newVaultKeypair } from "@/lib/vault";
import { buildShareholders, RoleWeights, EQUAL_WEIGHTS } from "@/lib/split";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";

interface PrepareLaunchBody {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  metadataUri: string;
  creatorWallet: string;
  squadId: string;
  squadBps: number;
  initialBuySol?: number;
  roleWeights?: RoleWeights;
  /** When true, creates a Devnet Vault-Funding test transaction instead of Mainnet Pump.fun CPI */
  demoMode?: boolean;
}

export async function POST(request: Request) {
  try {
    await ensureDbSchema();
    const body = (await request.json()) as PrepareLaunchBody;
    const {
      mint,
      name,
      symbol,
      description,
      imageUrl,
      twitter,
      telegram,
      website,
      metadataUri,
      creatorWallet,
      squadId,
      squadBps,
      initialBuySol = 0,
      roleWeights = EQUAL_WEIGHTS,
      demoMode = false,
    } = body;

    if (!mint || !name || !symbol || !creatorWallet || !squadId || !squadBps) {
      return NextResponse.json({ error: "Missing required launch fields" }, { status: 400 });
    }

    let mintPubkey: PublicKey;
    let creatorPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(mint);
      creatorPubkey = new PublicKey(creatorWallet);
    } catch {
      return NextResponse.json({ error: "Invalid Solana public key format" }, { status: 400 });
    }

    const provider = await getSquadProvider();
    const squad = await provider.getSquad(squadId);
    if (!squad) {
      return NextResponse.json({ error: "Squad not found" }, { status: 404 });
    }

    // Ensure squad & members are cached
    const existingSquad = await prisma.squad.findUnique({
      where: { id: squad.id },
      include: { members: { where: { active: true } } },
    });

    if (!existingSquad) {
      await prisma.squad.create({
        data: {
          id: squad.id,
          username: squad.username,
          profileImageUrl: squad.profileImageUrl,
          memberCount: squad.memberCount,
          syncedAt: new Date(),
          members: {
            create: squad.members
              .filter((m) => !!m.walletAddress)
              .map((m) => ({
                userId: m.userId,
                username: m.username,
                walletAddress: m.walletAddress!,
                role: m.role,
                active: true,
                syncedAt: new Date(),
              })),
          },
        },
      });
    } else {
      await prisma.squad.update({
        where: { id: squad.id },
        data: {
          username: squad.username,
          profileImageUrl: squad.profileImageUrl,
          memberCount: squad.memberCount,
          syncedAt: new Date(),
        },
      });
    }

    // 1. Generate dedicated custodial vault for this launch (deterministic from mint)
    const { keypair: vaultKeypair, encryptedSecret } = newVaultKeypair(mintPubkey.toBase58());
    const vaultPubkey = vaultKeypair.publicKey;

    const vaultRecord = await prisma.vault.upsert({
      where: { publicKey: vaultPubkey.toBase58() },
      create: {
        publicKey: vaultPubkey.toBase58(),
        encryptedSecret,
      },
      update: {
        encryptedSecret,
      },
    });

    // 2. Validate fee shares (Squad Vault + Creator + Optional Platform Treasury)
    const platformTreasury =
      process.env.SQUADRON_TREASURY_WALLET || process.env.PLATFORM_TREASURY || undefined;
    const rawPlatformBps = Number(process.env.PLATFORM_FEE_BPS || 0);
    const platformBps = platformTreasury && rawPlatformBps > 0 ? rawPlatformBps : 0;

    // Ensure squadBps + platformBps <= 10000
    const effectiveSquadBps = Math.min(squadBps, 10000 - platformBps);

    const shareholders = buildShareholders({
      vault: vaultPubkey.toBase58(),
      creator: creatorPubkey.toBase58(),
      squadBps: effectiveSquadBps,
      platformBps,
      platformTreasury,
    });

    const sharingConfigAddress = feeSharingConfigPda(mintPubkey);
    const instructions = [];

    // Priority Fees for reliable block inclusion
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    if (demoMode) {
      // Devnet Test Launch Mode: funds the Splitter Vault with initialBuySol (or 0.015 SOL)
      // so the creator can test real on-chain 20-wallet pro-rata SOL splitting on Devnet.
      const seedLamports =
        initialBuySol > 0
          ? Math.round(initialBuySol * LAMPORTS_PER_SOL)
          : Math.round(0.015 * LAMPORTS_PER_SOL);

      instructions.push(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey: vaultPubkey,
          lamports: seedLamports,
        })
      );
    } else {
      // Full Pump.fun Mainnet / SDK instruction sequence
      if (initialBuySol > 0) {
        try {
          const conn = new Connection(RPC_URL, "confirmed");
          const onlineSdk = new OnlinePumpSdk(conn);
          const global = await onlineSdk.fetchGlobal();
          const solAmount = new BN(Math.round(initialBuySol * LAMPORTS_PER_SOL));
          const tokenAmount = new BN(Math.floor(initialBuySol * 30_000_000 * 1e6));
          const createAndBuyIxs = await PUMP_SDK.createV2AndBuyInstructions({
            global,
            mint: mintPubkey,
            name,
            symbol,
            uri: metadataUri,
            creator: creatorPubkey,
            user: creatorPubkey,
            amount: tokenAmount,
            solAmount,
            mayhemMode: false,
          });
          instructions.push(...createAndBuyIxs);
          const sweepBeforeConfigIx = await PUMP_SDK.sweepCreatorFeeInstruction({
            payer: creatorPubkey,
            mint: mintPubkey,
            creator: creatorPubkey,
            quoteMint: PublicKey.default,
          });
          instructions.push(sweepBeforeConfigIx);
        } catch (err) {
          console.warn("Initial buy fetchGlobal fallback to standard createV2Instruction:", err);
          const createIx = await PUMP_SDK.createV2Instruction({
            mint: mintPubkey,
            name,
            symbol,
            uri: metadataUri,
            creator: creatorPubkey,
            user: creatorPubkey,
            mayhemMode: false,
          });
          instructions.push(createIx);
        }
      } else {
        const createIx = await PUMP_SDK.createV2Instruction({
          mint: mintPubkey,
          name,
          symbol,
          uri: metadataUri,
          creator: creatorPubkey,
          user: creatorPubkey,
          mayhemMode: false,
        });
        instructions.push(createIx);
      }

      const configIx = await PUMP_SDK.createFeeSharingConfig({
        creator: creatorPubkey,
        mint: mintPubkey,
        pool: null,
      });
      instructions.push(configIx);

      const sweepConfigIx = await PUMP_SDK.sweepCreatorFeeInstruction({
        payer: creatorPubkey,
        mint: mintPubkey,
        creator: sharingConfigAddress,
        quoteMint: PublicKey.default,
      });
      instructions.push(sweepConfigIx);

      const updateIx = await PUMP_SDK.updateFeeShares({
        authority: creatorPubkey,
        mint: mintPubkey,
        currentShareholders: [creatorPubkey],
        newShareholders: shareholders.map((s) => ({
          address: new PublicKey(s.address),
          shareBps: s.shareBps,
        })),
        bondingCurveComplete: false,
      });
      instructions.push(updateIx);
    }

    // Record launch with a self-healing stateless ID so any Vercel lambda container can hydrate it
    const statelessId = encodeStatelessLaunchId({
      m: mintPubkey.toBase58(),
      n: name,
      s: symbol,
      sq: squad.id,
      bps: effectiveSquadBps,
      cw: creatorPubkey.toBase58(),
    });

    const launchRecord = await prisma.launch.create({
      data: {
        id: statelessId,
        mint: mintPubkey.toBase58(),
        name,
        symbol,
        description: description || null,
        imageUrl: imageUrl || null,
        twitter: twitter || null,
        telegram: telegram || null,
        website: website || null,
        metadataUri,
        creatorWallet: creatorPubkey.toBase58(),
        squadId: squad.id,
        vaultId: vaultRecord.id,
        squadBps: effectiveSquadBps,
        creatorBps: 10000 - effectiveSquadBps - platformBps,
        platformBps,
        initialBuySol: Number(initialBuySol) || 0,
        roleWeightsJson: JSON.stringify(roleWeights),
        status: demoMode ? "LIVE" : "PENDING",
      },
    });

    const serializedIxs = instructions.map((ix) => ({
      programId: ix.programId.toBase58(),
      keys: ix.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data).toString("base64"),
    }));

    return NextResponse.json({
      launchId: launchRecord.id,
      vaultPublicKey: vaultPubkey.toBase58(),
      shareSharingConfigPda: sharingConfigAddress.toBase58(),
      shareholders,
      demoMode,
      requiresMintSignature: !demoMode,
      instructions: serializedIxs,
    });
  } catch (error) {
    console.error("Failed to prepare launch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
