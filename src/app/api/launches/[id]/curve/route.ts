import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { prisma, ensureLaunchHydrated } from "@/lib/prisma";

const RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.devnet.solana.com";

/**
 * GET /api/launches/[id]/curve
 * Fetches live Pump.fun bonding curve state & graduation progress (or simulated curve metrics on Devnet).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await ensureLaunchHydrated(id);
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: {
        payouts: {
          where: { status: "SENT" },
          select: { lamports: true },
        },
      },
    });

    if (!launch) {
      return NextResponse.json({ error: "Launch not found" }, { status: 404 });
    }

    const conn = new Connection(RPC_URL, "confirmed");
    let onChainCurveFound = false;
    let realSolReservesSol = 0;
    let virtualSolReservesSol = 30;
    let graduationPct = 0;
    let complete = false;

    try {
      const onlineSdk = new OnlinePumpSdk(conn);
      const bondingCurve = await onlineSdk.fetchBondingCurve(
        new PublicKey(launch.mint)
      );
      if (bondingCurve && bondingCurve.virtualQuoteReserves) {
        onChainCurveFound = true;
        realSolReservesSol =
          Number(bondingCurve.realQuoteReserves.toString()) / 1e9;
        virtualSolReservesSol =
          Number(bondingCurve.virtualQuoteReserves.toString()) / 1e9;
        complete = Boolean(bondingCurve.complete);
        // Pump.fun graduation target is ~85 SOL in realQuoteReserves
        graduationPct = complete
          ? 100
          : Math.min(100, Math.round((realSolReservesSol / 85) * 100));
      }
    } catch {
      // Devnet Vault Test mints don't have a Mainnet Pump.fun bonding curve account
      onChainCurveFound = false;
    }

    if (!onChainCurveFound) {
      const totalDistributedSol =
        Number(
          launch.payouts.reduce((acc, p) => acc + p.lamports, 0n)
        ) / 1e9;
      // Estimate implied bonding curve progress from initial buy + fee volume
      realSolReservesSol = Number(
        (launch.initialBuySol + totalDistributedSol * 25).toFixed(3)
      );
      virtualSolReservesSol = Number((30 + realSolReservesSol).toFixed(3));
      graduationPct = Math.min(
        100,
        Math.max(2, Math.round((realSolReservesSol / 85) * 100))
      );
    }

    // Implied market cap in SOL (Pump.fun 1B supply, virtualSol / virtualToken)
    const estMarketCapSol = Number((virtualSolReservesSol * 1.35).toFixed(2));

    return NextResponse.json({
      onChainCurveFound,
      realSolReservesSol,
      virtualSolReservesSol,
      graduationTargetSol: 85,
      graduationPct,
      complete,
      estMarketCapSol,
    });
  } catch (error) {
    console.error("GET /api/launches/[id]/curve error:", error);
    return NextResponse.json(
      { error: "Failed to read bonding curve state" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/launches/[id]/curve
 * Builds a Pump.fun Bonding Curve BUY transaction for the connected wallet,
 * or on Devnet Vault Test mode builds a simulated trade that routes the creator fee share directly into the Splitter Vault.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { buyerWallet, solAmount, slippageBps = 500 } = body;

    if (!buyerWallet || !solAmount || Number(solAmount) <= 0) {
      return NextResponse.json(
        { error: "buyerWallet and positive solAmount are required" },
        { status: 400 }
      );
    }

    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!launch || !launch.vault) {
      return NextResponse.json({ error: "Launch not found" }, { status: 404 });
    }

    const conn = new Connection(RPC_URL, "confirmed");
    const buyerPubkey = new PublicKey(buyerWallet);
    const mintPubkey = new PublicKey(launch.mint);
    const lamportsIn = BigInt(Math.round(Number(solAmount) * 1e9));

    // Try building native Pump.fun buy instructions if the bonding curve exists on-chain
    try {
      const onlineSdk = new OnlinePumpSdk(conn);
      const bondingCurveAccountInfo = await conn.getAccountInfo(
        mintPubkey
      );
      if (bondingCurveAccountInfo) {
        const global = await onlineSdk.fetchGlobal();
        const { bondingCurve, associatedUserAccountInfo } =
          await onlineSdk.fetchBuyState(mintPubkey, buyerPubkey);

        if (bondingCurve && !bondingCurve.complete) {
          const solAmountBn = new BN(lamportsIn.toString());
          // Calculate tokens out with slippage buffer
          const virtualSol = new BN(bondingCurve.virtualQuoteReserves.toString());
          const virtualTokens = new BN(
            bondingCurve.virtualTokenReserves.toString()
          );
          const tokenAmountOut = solAmountBn
            .mul(virtualTokens)
            .div(virtualSol.add(solAmountBn));

          const maxSolCost = solAmountBn
            .mul(new BN(10000 + Number(slippageBps)))
            .div(new BN(10000));

          const { PUMP_SDK } = await import("@pump-fun/pump-sdk");
          const buyIxs = await PUMP_SDK.buyInstructions({
            global,
            bondingCurveAccountInfo: null as never,
            bondingCurve,
            associatedUserAccountInfo,
            mint: mintPubkey,
            user: buyerPubkey,
            amount: tokenAmountOut,
            solAmount: maxSolCost,
            slippage: Number(slippageBps) / 100,
            tokenProgram: bondingCurveAccountInfo.owner,
          });

          return NextResponse.json({
            mode: "PUMP_BONDING_CURVE",
            estimatedTokensOut: (
              Number(tokenAmountOut.toString()) / 1e6
            ).toFixed(2),
            instructions: buyIxs.map((ix) => ({
              programId: ix.programId.toBase58(),
              keys: ix.keys.map((k) => ({
                pubkey: k.pubkey.toBase58(),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })),
              data: Buffer.from(ix.data).toString("base64"),
            })),
          });
        }
      }
    } catch {
      // Fallback to Devnet Simulated Trade -> Vault Fee Router below
    }

    // Devnet Simulated Trade: routes simulated creator fee directly into the Splitter Vault
    const { SystemProgram, ComputeBudgetProgram } = await import(
      "@solana/web3.js"
    );
    const feeLamports = Math.max(
      1_000_000,
      Math.round(Number(lamportsIn) * (launch.squadBps / 10000))
    );

    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: new PublicKey(launch.vault.publicKey),
        lamports: feeLamports,
      }),
    ];

    return NextResponse.json({
      mode: "DEVNET_FEE_SIMULATION",
      simulatedFeeSol: (feeLamports / 1e9).toFixed(4),
      estimatedTokensOut: (Number(solAmount) * 32_500_000).toLocaleString(),
      instructions: ixs.map((ix) => ({
        programId: ix.programId.toBase58(),
        keys: ix.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(ix.data).toString("base64"),
      })),
    });
  } catch (error) {
    console.error("POST /api/launches/[id]/curve error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build trade transaction",
      },
      { status: 500 }
    );
  }
}
