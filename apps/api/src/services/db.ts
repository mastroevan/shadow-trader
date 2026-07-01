import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const DATA_DIR = path.join(process.cwd(), "data");
const DEFAULT_DATABASE_URL = "file:./data/shadow-trader.db";

let prisma: PrismaClient | null = null;
let initPromise: Promise<PrismaClient> | null = null;

export async function getDb() {
  if (prisma) return prisma;

  initPromise ??= initDb();

  return initPromise;
}

async function initDb() {
  await mkdir(DATA_DIR, { recursive: true });

  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });

  prisma = new PrismaClient({ adapter });
  await ensureSchema(prisma);
  await importLegacyJsonIfNeeded(prisma);

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

async function importLegacyJsonIfNeeded(client: PrismaClient) {
  if (process.env.SHADOW_TRADER_SKIP_LEGACY_IMPORT === "true") {
    return;
  }

  const lifecycleCount = await client.tradeLifecycleEntry.count();

  if (lifecycleCount === 0) {
    await importLegacyLifecycleFile(client, "watchlist.json", "WATCHLIST");
    await importLegacyLifecycleFile(client, "trade-list.json", "PAPER_TRADE");
    await importLegacyLifecycleFile(client, "trust-ledger.json", "LEDGER");
  }

  const thesisCount = await client.thesisRecord.count();

  if (thesisCount === 0) {
    const records = await readLegacyJsonArray("theses.json");

    for (const record of records) {
      const id = stringValue(record.id);
      if (!id) continue;

      await client.thesisRecord.upsert({
        where: { id },
        create: {
          id,
          symbol: stringValue(record.symbol) || "UNKNOWN",
          status: stringValue(record.status) || "ACTIVE",
          payloadJson: JSON.stringify(record),
          generatedAt: dateValue(record.generatedAt),
          updatedAt: dateValue(record.outcome?.resolvedAt ?? record.generatedAt),
        },
        update: {},
      });
    }
  }
}

async function importLegacyLifecycleFile(
  client: PrismaClient,
  filename: string,
  kind: string
) {
  const entries = await readLegacyJsonArray(filename);

  for (const entry of entries) {
    const id = stringValue(entry.id);
    if (!id) continue;

    await client.tradeLifecycleEntry.upsert({
      where: { id },
      create: {
        id,
        kind,
        symbol: stringValue(entry.symbol) || "UNKNOWN",
        status: stringValue(entry.status) || "Watching",
        ledgerId: typeof entry.ledgerId === "string" ? entry.ledgerId : null,
        payloadJson: JSON.stringify(entry),
        createdAt: dateValue(entry.createdAt),
        updatedAt: dateValue(entry.updatedAt),
      },
      update: {},
    });
  }
}

async function readLegacyJsonArray(filename: string): Promise<Array<Record<string, any>>> {
  try {
    const data = await readFile(path.join(DATA_DIR, filename), "utf8");
    const parsed = JSON.parse(data) as unknown;

    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}

function dateValue(value: unknown) {
  const date = typeof value === "string" || typeof value === "number"
    ? new Date(value)
    : new Date();

  return Number.isNaN(date.getTime()) ? new Date() : date;
}
