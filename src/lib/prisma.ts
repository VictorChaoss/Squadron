import { PrismaClient } from "@prisma/client";

/**
 * Ensures zero-config serverless deployments (like Vercel without DATABASE_URL set)
 * automatically use a writable /tmp SQLite database and self-initialize all tables.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/tmp/squadron.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  schemaInitialized: Promise<void> | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureDbSchema(): Promise<void> {
  if (globalForPrisma.schemaInitialized) {
    return globalForPrisma.schemaInitialized;
  }

  globalForPrisma.schemaInitialized = (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Squad" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "username" TEXT NOT NULL,
          "profileImageUrl" TEXT,
          "memberCount" INTEGER NOT NULL DEFAULT 0,
          "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Member" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "squadId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "username" TEXT NOT NULL,
          "walletAddress" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "active" BOOLEAN NOT NULL DEFAULT true,
          "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Member_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Member_squadId_userId_key" ON "Member"("squadId", "userId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Member_squadId_active_idx" ON "Member"("squadId", "active");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Vault" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "publicKey" TEXT NOT NULL,
          "encryptedSecret" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Vault_publicKey_key" ON "Vault"("publicKey");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Launch" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "mint" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "symbol" TEXT NOT NULL,
          "description" TEXT,
          "imageUrl" TEXT,
          "twitter" TEXT,
          "telegram" TEXT,
          "website" TEXT,
          "metadataUri" TEXT NOT NULL,
          "creatorWallet" TEXT NOT NULL,
          "squadId" TEXT NOT NULL,
          "squadBps" INTEGER NOT NULL,
          "creatorBps" INTEGER NOT NULL,
          "platformBps" INTEGER NOT NULL DEFAULT 0,
          "initialBuySol" REAL NOT NULL DEFAULT 0,
          "roleWeightsJson" TEXT NOT NULL DEFAULT '{"OWNER":1,"ADMIN":1,"MEMBER":1}',
          "vaultId" TEXT NOT NULL,
          "createSig" TEXT,
          "feeConfigSig" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PREPARED',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Launch_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Launch_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Launch_mint_key" ON "Launch"("mint");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Launch_vaultId_key" ON "Launch"("vaultId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Payout" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "launchId" TEXT NOT NULL,
          "batchId" TEXT NOT NULL,
          "walletAddress" TEXT NOT NULL,
          "userId" TEXT,
          "lamports" BIGINT NOT NULL,
          "signature" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Payout_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Payout_launchId_createdAt_idx" ON "Payout"("launchId", "createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Payout_walletAddress_idx" ON "Payout"("walletAddress");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Sweep" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "launchId" TEXT NOT NULL,
          "signature" TEXT,
          "distributableLamports" BIGINT NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Sweep_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
    } catch (err) {
      console.error("Schema auto-init warning:", err);
    }
  })();

  return globalForPrisma.schemaInitialized;
}
