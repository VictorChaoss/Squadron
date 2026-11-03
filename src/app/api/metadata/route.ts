import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const symbol = String(formData.get("symbol") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const twitter = String(formData.get("twitter") || "").trim();
    const telegram = String(formData.get("telegram") || "").trim();
    const website = String(formData.get("website") || "").trim();
    const file = formData.get("image") as File | null;

    if (!name || !symbol) {
      return NextResponse.json({ error: "Name and symbol are required" }, { status: 400 });
    }

    const pinataJwt = process.env.PINATA_JWT;
    const gateway = process.env.PINATA_GATEWAY || "https://ipfs.io/ipfs";

    let imageUrl = "";
    let fileBytes: Buffer | null = null;
    let fileName = "";
    const id = randomBytes(8).toString("hex");
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    if (file && file.size > 0) {
      fileBytes = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name) || ".png";
      fileName = `token-${id}${ext}`;
      const localPath = path.join(uploadsDir, fileName);
      await writeFile(localPath, fileBytes);
      imageUrl = `/uploads/${fileName}`;

      if (pinataJwt) {
        try {
          const pinForm = new FormData();
          pinForm.append("file", new Blob([new Uint8Array(fileBytes)], { type: file.type || "image/png" }), fileName);
          const pinRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: { Authorization: `Bearer ${pinataJwt}` },
            body: pinForm,
          });
          if (pinRes.ok) {
            const pinJson = (await pinRes.json()) as { IpfsHash: string };
            imageUrl = `${gateway}/${pinJson.IpfsHash}`;
          }
        } catch (err) {
          console.warn("Pinata image upload failed, falling back:", err);
        }
      }
    } else {
      imageUrl = "/branding/logo-square.jpg";
    }

    // 1. Try Pinata JSON upload if PINATA_JWT is set
    const metadataPayload = {
      name,
      symbol,
      description,
      image: imageUrl.startsWith("http") ? imageUrl : `https://pump.fun${imageUrl}`,
      showName: true,
      createdOn: "https://pump.fun",
      ...(twitter ? { twitter } : {}),
      ...(telegram ? { telegram } : {}),
      ...(website ? { website } : {}),
    };

    if (pinataJwt) {
      try {
        const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pinataMetadata: { name: `${symbol}-metadata.json` },
            pinataContent: metadataPayload,
          }),
        });
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as { IpfsHash: string };
          return NextResponse.json({
            metadataUri: `${gateway}/${metaJson.IpfsHash}`,
            imageUrl,
            provider: "pinata",
          });
        }
      } catch (err) {
        console.warn("Pinata JSON upload failed, trying pump.fun IPFS fallback:", err);
      }
    }

    // 2. Try Pump.fun official IPFS endpoint (zero-key fallback when network is reachable)
    if (fileBytes && file) {
      try {
        const pumpForm = new FormData();
        pumpForm.append("file", new Blob([new Uint8Array(fileBytes)], { type: file.type || "image/png" }), fileName);
        pumpForm.append("name", name);
        pumpForm.append("symbol", symbol);
        pumpForm.append("description", description);
        if (twitter) pumpForm.append("twitter", twitter);
        if (telegram) pumpForm.append("telegram", telegram);
        if (website) pumpForm.append("website", website);
        pumpForm.append("showName", "true");

        const pumpRes = await fetch("https://pump.fun/api/ipfs", {
          method: "POST",
          body: pumpForm,
        });
        if (pumpRes.ok) {
          const pumpJson = (await pumpRes.json()) as {
            metadataUri?: string;
            metadata?: { image?: string };
          };
          if (pumpJson.metadataUri) {
            return NextResponse.json({
              metadataUri: pumpJson.metadataUri,
              imageUrl: pumpJson.metadata?.image || imageUrl,
              provider: "pump-ipfs",
            });
          }
        }
      } catch {
        // Fallback to local metadata below
      }
    }

    // 3. Local static fallback
    const metaFileName = `meta-${id}.json`;
    await writeFile(path.join(uploadsDir, metaFileName), JSON.stringify(metadataPayload, null, 2));
    const origin = new URL(request.url).origin;

    return NextResponse.json({
      metadataUri: `${origin}/uploads/${metaFileName}`,
      imageUrl,
      provider: "local",
    });
  } catch (error) {
    console.error("Metadata upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
