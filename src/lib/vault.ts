import { Keypair } from "@solana/web3.js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Custodial vault keys (v1). Secrets are AES-256-GCM encrypted at rest with
 * VAULT_ENCRYPTION_KEY or VAULT_MASTER_KEY (32 bytes, hex or base64).
 * Includes a deterministic fallback for zero-config Devnet/Vercel preview deployments.
 */
function key(): Buffer {
  const raw =
    process.env.VAULT_ENCRYPTION_KEY ||
    process.env.VAULT_MASTER_KEY ||
    createHash("sha256")
      .update("squadron-default-devnet-vault-encryption-key-v1")
      .digest("hex");
  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    return createHash("sha256").update(raw).digest();
  }
  return buf;
}

export function encryptSecret(secret: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secret), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): Uint8Array {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([d.update(enc), d.final()]));
}

export function newVaultKeypair(): { keypair: Keypair; encryptedSecret: string } {
  const keypair = Keypair.generate();
  return { keypair, encryptedSecret: encryptSecret(keypair.secretKey) };
}

export function loadVaultKeypair(encryptedSecret: string): Keypair {
  return Keypair.fromSecretKey(decryptSecret(encryptedSecret));
}
