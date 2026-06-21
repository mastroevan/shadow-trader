import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  normalizeSheetsHorizon,
  normalizeWatchlistStatus,
  type WatchlistStatus,
} from "./watchlistFields";

export type WatchlistEntry = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  startPrice: number | null;
  thesis: string;
  entryTrigger: string;
  invalidation: string;
  watchConditions: string[];
  traceId?: string;
  timeHorizon: string;
  status: WatchlistStatus;
  createdAt: string;
  updatedAt: string;
};

type CreateWatchlistEntryInput = Omit<
  WatchlistEntry,
  "id" | "createdAt" | "updatedAt"
>;

export type TradeEntry = WatchlistEntry & {
  status: "Triggered";
  entryDate: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  currentProfitLoss: number | null;
  currentProfitLossPercent: number | null;
  notes: string;
};

export type LedgerEntry = WatchlistEntry & {
  ledgerId: string;
  recordType: "Invalidated Setup" | "Expired Setup" | "Closed Trade";
  dateInvalidated?: string;
  invalidationReason?: string;
  expirationDate?: string;
  entryDate?: string | null;
  entryPrice?: number | null;
  exitDate?: string;
  exitPrice?: number | null;
  profitLoss?: number | null;
  profitLossPercent?: number | null;
  outcome?: "Win" | "Loss";
  notes?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");
const TRADE_LIST_PATH = path.join(DATA_DIR, "trade-list.json");
const TRUST_LEDGER_PATH = path.join(DATA_DIR, "trust-ledger.json");
let writeQueue = Promise.resolve();

export async function listWatchlistEntries(): Promise<WatchlistEntry[]> {
  const entries = await readJsonArray<WatchlistEntry>(WATCHLIST_PATH);
  return dedupeActiveWatchlist(entries.map(normalizeStoredEntry));
}

export async function listTradeEntries(): Promise<TradeEntry[]> {
  const entries = await readJsonArray<TradeEntry>(TRADE_LIST_PATH);
  return entries.map(normalizeTradeEntry);
}

export async function listLedgerEntries(): Promise<LedgerEntry[]> {
  const entries = await readJsonArray<LedgerEntry>(TRUST_LEDGER_PATH);
  return entries.map((entry) => ({
    ...normalizeStoredEntry(entry),
    ...entry,
    ledgerId: entry.ledgerId ?? randomUUID(),
  }));
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const data = await readFile(filePath, "utf8");
    const entries = JSON.parse(data) as T[];

    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export async function upsertWatchlistEntry(
  input: CreateWatchlistEntryInput
): Promise<{ entry: WatchlistEntry; created: boolean }> {
  const now = new Date().toISOString();
  let savedEntry: WatchlistEntry | null = null;
  let created = false;

  await updateWatchlistEntries((entries) => {
    const normalizedSymbol = input.symbol.toUpperCase();
    const existing = entries.find((entry) => entry.symbol.toUpperCase() === normalizedSymbol);

    if (!existing) {
      created = true;
      savedEntry = {
        ...input,
        symbol: normalizedSymbol,
        status: "Watching",
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };

      return [savedEntry, ...entries];
    }

    savedEntry = {
      ...existing,
      ...input,
      symbol: existing.symbol,
      id: existing.id,
      traceId: existing.traceId ?? input.traceId,
      status: "Watching",
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    return [savedEntry, ...entries.filter((entry) => entry.id !== existing.id)];
  });

  return { entry: savedEntry!, created };
}

export async function moveWatchlistEntry(
  id: string,
  status: WatchlistStatus
): Promise<{ entry: TradeEntry | LedgerEntry; previousEntry: WatchlistEntry } | null> {
  if (status === "Watching") return null;

  let previousEntry: WatchlistEntry | null = null;
  let movedEntry: TradeEntry | LedgerEntry | null = null;

  await updateWatchlistEntries((entries) => {
    previousEntry = entries.find((entry) => entry.id === id) ?? null;
    return entries.filter((entry) => entry.id !== id);
  });

  if (!previousEntry) return null;

  if (status === "Triggered") {
    movedEntry = await addTradeEntry(previousEntry);
  } else {
    movedEntry = await addLedgerEntry(previousEntry, status);
  }

  return { entry: movedEntry, previousEntry };
}

export async function rollbackWatchlistMove(
  movedEntry: TradeEntry | LedgerEntry,
  previousEntry: WatchlistEntry
): Promise<void> {
  if (movedEntry.status === "Triggered") {
    await updateTradeEntries((entries) => entries.filter((entry) => entry.id !== movedEntry.id));
  } else {
    await updateLedgerEntries((entries) =>
      entries.filter((entry) => entry.ledgerId !== movedEntry.ledgerId)
    );
  }

  await updateWatchlistEntries((entries) => [previousEntry, ...entries]);
}

export async function deleteWatchlistEntry(id: string): Promise<boolean> {
  let deleted = false;

  await updateWatchlistEntries((entries) => {
    const nextEntries = entries.filter((entry) => entry.id !== id);
    deleted = nextEntries.length !== entries.length;

    return nextEntries;
  });

  return deleted;
}

export async function closeTradeEntry(
  id: string,
  outcome: "Win" | "Loss",
  input: { exitPrice?: number | null; notes?: string }
): Promise<LedgerEntry | null> {
  const trade = (await listTradeEntries()).find((entry) => entry.id === id) ?? null;

  if (!trade) return null;

  await writeJsonFile(
    TRADE_LIST_PATH,
    (await listTradeEntries()).filter((entry) => entry.id !== id)
  );

  const exitPrice = input.exitPrice ?? trade.currentPrice ?? null;
  const profitLoss =
    typeof exitPrice === "number" && typeof trade.entryPrice === "number"
      ? exitPrice - trade.entryPrice
      : null;
  const profitLossPercent =
    profitLoss !== null && typeof trade.entryPrice === "number" && trade.entryPrice !== 0
      ? profitLoss / trade.entryPrice
      : null;

  const ledgerEntry: LedgerEntry = {
    ...trade,
    ledgerId: randomUUID(),
    recordType: "Closed Trade",
    exitDate: new Date().toISOString(),
    exitPrice,
    profitLoss,
    profitLossPercent,
    outcome,
    notes: input.notes ?? trade.notes,
    updatedAt: new Date().toISOString(),
  };

  await updateLedgerEntries((entries) => [ledgerEntry, ...entries]);

  return ledgerEntry;
}

async function addTradeEntry(entry: WatchlistEntry): Promise<TradeEntry> {
  const trade: TradeEntry = {
    ...entry,
    status: "Triggered",
    entryDate: new Date().toISOString(),
    entryPrice: entry.startPrice,
    currentPrice: entry.startPrice,
    currentProfitLoss: null,
    currentProfitLossPercent: null,
    notes: "",
    updatedAt: new Date().toISOString(),
  };

  await updateTradeEntries((entries) => [trade, ...entries.filter((current) => current.id !== trade.id)]);

  return trade;
}

async function addLedgerEntry(entry: WatchlistEntry, status: "Invalidated" | "Expired"): Promise<LedgerEntry> {
  const now = new Date().toISOString();
  const ledgerEntry: LedgerEntry = {
    ...entry,
    status,
    ledgerId: randomUUID(),
    recordType: status === "Invalidated" ? "Invalidated Setup" : "Expired Setup",
    ...(status === "Invalidated"
      ? { dateInvalidated: now, invalidationReason: entry.invalidation }
      : { expirationDate: now }),
    updatedAt: now,
  };

  await updateLedgerEntries((entries) => [ledgerEntry, ...entries]);

  return ledgerEntry;
}

function normalizeStoredEntry(entry: WatchlistEntry): WatchlistEntry {
  const createdAt = entry.createdAt ?? new Date().toISOString();

  return {
    ...entry,
    startPrice:
      typeof entry.startPrice === "number" && Number.isFinite(entry.startPrice)
        ? entry.startPrice
        : null,
    watchConditions: Array.isArray(entry.watchConditions)
      ? entry.watchConditions.map(String)
      : [],
    timeHorizon: normalizeSheetsHorizon(entry.timeHorizon),
    status: normalizeWatchlistStatus(entry.status),
    createdAt,
    updatedAt: entry.updatedAt ?? createdAt,
  };
}

function normalizeTradeEntry(entry: TradeEntry): TradeEntry {
  const normalized = normalizeStoredEntry(entry);

  return {
    ...normalized,
    status: "Triggered",
    entryDate: entry.entryDate ?? normalized.updatedAt,
    entryPrice: typeof entry.entryPrice === "number" ? entry.entryPrice : normalized.startPrice,
    currentPrice: typeof entry.currentPrice === "number" ? entry.currentPrice : normalized.startPrice,
    currentProfitLoss: typeof entry.currentProfitLoss === "number" ? entry.currentProfitLoss : null,
    currentProfitLossPercent:
      typeof entry.currentProfitLossPercent === "number" ? entry.currentProfitLossPercent : null,
    notes: entry.notes ?? "",
  };
}

function dedupeActiveWatchlist(entries: WatchlistEntry[]) {
  const seen = new Set<string>();
  const deduped: WatchlistEntry[] = [];

  for (const entry of entries) {
    const symbol = entry.symbol.toUpperCase();
    if (entry.status !== "Watching" || seen.has(symbol)) continue;
    seen.add(symbol);
    deduped.push({ ...entry, symbol });
  }

  return deduped;
}

async function updateWatchlistEntries(
  updater: (entries: WatchlistEntry[]) => WatchlistEntry[]
): Promise<void> {
  const nextWrite = writeQueue.then(async () => {
    const entries = await listWatchlistEntries();
    const nextEntries = updater(entries);

    await writeWatchlistEntries(nextEntries);
  });

  writeQueue = nextWrite.catch(() => undefined);

  await nextWrite;
}

async function writeWatchlistEntries(entries: WatchlistEntry[]): Promise<void> {
  await writeJsonFile(WATCHLIST_PATH, dedupeActiveWatchlist(entries));
}

async function updateTradeEntries(
  updater: (entries: TradeEntry[]) => TradeEntry[]
): Promise<void> {
  const entries = await listTradeEntries();
  await writeJsonFile(TRADE_LIST_PATH, updater(entries));
}

async function updateLedgerEntries(
  updater: (entries: LedgerEntry[]) => LedgerEntry[]
): Promise<void> {
  const entries = await listLedgerEntries();
  await writeJsonFile(TRUST_LEDGER_PATH, updater(entries));
}

async function writeJsonFile(filePath: string, entries: unknown[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const tempPath = path.join(DATA_DIR, `${path.basename(filePath)}.${randomUUID()}.tmp`);
  await writeFile(tempPath, JSON.stringify(entries, null, 2));
  await rename(tempPath, filePath);
}
