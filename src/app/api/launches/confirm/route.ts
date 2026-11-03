import { NextResponse } from "next/server";
import { prisma, ensureLaunchHydrated } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { launchId, createSig, feeConfigSig } = await request.json();

    if (!launchId) {
      return NextResponse.json({ error: "Missing launchId" }, { status: 400 });
    }

    await ensureLaunchHydrated(launchId);

    const updated = await prisma.launch.update({
      where: { id: launchId },
      data: {
        createSig: createSig || null,
        feeConfigSig: feeConfigSig || null,
        status: "LIVE",
      },
    });

    return NextResponse.json({ success: true, launch: updated });
  } catch (error) {
    console.error("Failed to confirm launch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
