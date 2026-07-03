import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

let prisma: PrismaClient | null = null;
let initPromise: Promise<PrismaClient> | null = null;

export async function getDb() {
  if (prisma) return prisma;

  initPromise ??= initDb();

  return initPromise;
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  prisma = new PrismaClient({ adapter });
  await ensureSchema(prisma);

  return prisma;
}

async function ensureSchema(client: PrismaClient) {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TradeLifecycleEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "ledgerId" TEXT,
      "payloadJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TradeLifecycleEntry_ledgerId_key"
    ON "TradeLifecycleEntry"("ledgerId")
    WHERE "ledgerId" IS NOT NULL
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TradeLifecycleEntry_kind_status_idx"
    ON "TradeLifecycleEntry"("kind", "status")
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TradeLifecycleEntry_kind_symbol_idx"
    ON "TradeLifecycleEntry"("kind", "symbol")
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TradeLifecycleEntry_updatedAt_idx"
    ON "TradeLifecycleEntry"("updatedAt")
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ThesisRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "symbol" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "payloadJson" TEXT NOT NULL,
      "generatedAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ThesisRecord_symbol_idx"
    ON "ThesisRecord"("symbol")
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ThesisRecord_status_idx"
    ON "ThesisRecord"("status")
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ThesisRecord_generatedAt_idx"
    ON "ThesisRecord"("generatedAt")
  `);
}
