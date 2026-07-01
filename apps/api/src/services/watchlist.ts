import { randomUUID } from "node:crypto";
import { getDb } from "./db";
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
  riskExplanation?: string;
  news?: Array<{
    headline?: string;
    source?: string;
    url?: string;
  }>;
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
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  fees: number | null;
  slippage: number | null;
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
  quantity?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  fees?: number | null;
  slippage?: number | null;
  exitDate?: string;
  exitPrice?: number | null;
  profitLoss?: number | null;
  profitLossPercent?: number | null;
  outcome?: "Win" | "Loss";
  notes?: string;
};

const KIND_WATCHLIST = "WATCHLIST";
const KIND_PAPER_TRADE = "PAPER_TRADE";
const KIND_LEDGER = "LEDGER";

export async function listWatchlistEntries(): Promise<WatchlistEntry[]> {
  const db = await getDb();
  const rows = await db.tradeLifecycleEntry.findMany({
    where: {
      kind: KIND_WATCHLIST,
      status: "Watching",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return dedupeActiveWatchlist(rows.map((row) => normalizeStoredEntry(parsePayload<WatchlistEntry>(row.payloadJson))));
}

export async function listTradeEntries(): Promise<TradeEntry[]> {
  const db = await getDb();
  const rows = await db.tradeLifecycleEntry.findMany({
    where: {
      kind: KIND_PAPER_TRADE,
      status: "Triggered",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return rows.map((row) => normalizeTradeEntry(parsePayload<TradeEntry>(row.payloadJson)));
}

export async function listLedgerEntries(): Promise<LedgerEntry[]> {
  const db = await getDb();
  const rows = await db.tradeLifecycleEntry.findMany({
    where: {
      kind: KIND_LEDGER,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return rows.map((row) => normalizeLedgerEntry(parsePayload<LedgerEntry>(row.payloadJson)));
}

export async function upsertWatchlistEntry(
  input: CreateWatchlistEntryInput
): Promise<{ entry: WatchlistEntry; created: boolean }> {
  const db = await getDb();
  const now = new Date().toISOString();
  const normalizedSymbol = input.symbol.toUpperCase();
  const existing = await db.tradeLifecycleEntry.findFirst({
    where: {
      kind: KIND_WATCHLIST,
      symbol: normalizedSymbol,
      status: "Watching",
    },
  });
  const created = !existing;
  const existingEntry = existing ? normalizeStoredEntry(parsePayload<WatchlistEntry>(existing.payloadJson)) : null;
  const savedEntry: WatchlistEntry = existingEntry
    ? {
        ...existingEntry,
        ...input,
        symbol: existingEntry.symbol,
        id: existingEntry.id,
        traceId: existingEntry.traceId ?? input.traceId,
        status: "Watching",
        createdAt: existingEntry.createdAt,
        updatedAt: now,
      }
    : {
        ...input,
        symbol: normalizedSymbol,
        status: "Watching",
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };

  await db.tradeLifecycleEntry.upsert({
    where: { id: savedEntry.id },
    create: lifecycleRowInput(KIND_WATCHLIST, savedEntry),
    update: lifecycleRowUpdate(KIND_WATCHLIST, savedEntry),
  });

  return { entry: savedEntry, created };
}

export async function moveWatchlistEntry(
  id: string,
  status: WatchlistStatus
): Promise<{ entry: TradeEntry | LedgerEntry; previousEntry: WatchlistEntry } | null> {
  if (status === "Watching") return null;

  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id },
  });

  if (!row || row.kind !== KIND_WATCHLIST) return null;

  const previousEntry = normalizeStoredEntry(parsePayload<WatchlistEntry>(row.payloadJson));
  const movedEntry = status === "Triggered"
    ? buildTradeEntry(previousEntry, {})
    : buildLedgerEntry(previousEntry, status);

  await db.$transaction([
    db.tradeLifecycleEntry.delete({
      where: { id },
    }),
    db.tradeLifecycleEntry.create({
      data: lifecycleRowInput(
        status === "Triggered" ? KIND_PAPER_TRADE : KIND_LEDGER,
        movedEntry
      ),
    }),
  ]);

  return { entry: movedEntry, previousEntry };
}

export async function rollbackWatchlistMove(
  movedEntry: TradeEntry | LedgerEntry,
  previousEntry: WatchlistEntry
): Promise<void> {
  const db = await getDb();

  if (movedEntry.status === "Triggered") {
    await db.tradeLifecycleEntry.deleteMany({
      where: {
        id: movedEntry.id,
        kind: KIND_PAPER_TRADE,
      },
    });
  } else {
    await db.tradeLifecycleEntry.deleteMany({
      where: {
        id: movedEntry.id,
        kind: KIND_LEDGER,
      },
    });
  }

  await db.tradeLifecycleEntry.upsert({
    where: { id: previousEntry.id },
    create: lifecycleRowInput(KIND_WATCHLIST, previousEntry),
    update: lifecycleRowUpdate(KIND_WATCHLIST, previousEntry),
  });
}

export async function deleteWatchlistEntry(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.tradeLifecycleEntry.deleteMany({
    where: {
      id,
      kind: KIND_WATCHLIST,
    },
  });

  return result.count > 0;
}

export async function openPaperTradeEntry(
  id: string,
  input: {
    entryPrice?: number | null;
    quantity?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    fees?: number | null;
    slippage?: number | null;
    notes?: string;
  }
): Promise<{ entry: TradeEntry; previousEntry: WatchlistEntry } | null> {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id },
  });

  if (!row || row.kind !== KIND_WATCHLIST) return null;

  const previousEntry = normalizeStoredEntry(parsePayload<WatchlistEntry>(row.payloadJson));
  const trade = buildTradeEntry(previousEntry, input);

  await db.$transaction([
    db.tradeLifecycleEntry.delete({
      where: { id },
    }),
    db.tradeLifecycleEntry.create({
      data: lifecycleRowInput(KIND_PAPER_TRADE, trade),
    }),
  ]);

  return { entry: trade, previousEntry };
}

export async function updatePaperTradeEntry(
  id: string,
  input: {
    currentPrice?: number | null;
    notes?: string;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }
): Promise<TradeEntry | null> {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id },
  });

  if (!row || row.kind !== KIND_PAPER_TRADE) return null;

  const current = normalizeTradeEntry(parsePayload<TradeEntry>(row.payloadJson));
  const nextPrice = input.currentPrice ?? current.currentPrice ?? current.entryPrice;
  const nextTrade = withPaperTradeProfit({
    ...current,
    currentPrice: nextPrice,
    notes: input.notes ?? current.notes,
    stopLoss: input.stopLoss ?? current.stopLoss,
    takeProfit: input.takeProfit ?? current.takeProfit,
    updatedAt: new Date().toISOString(),
  });

  await db.tradeLifecycleEntry.update({
    where: { id },
    data: lifecycleRowUpdate(KIND_PAPER_TRADE, nextTrade),
  });

  return nextTrade;
}

export async function closeTradeEntry(
  id: string,
  outcome: "Win" | "Loss",
  input: { exitPrice?: number | null; notes?: string }
): Promise<LedgerEntry | null> {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id },
  });

  if (!row || row.kind !== KIND_PAPER_TRADE) return null;

  const trade = normalizeTradeEntry(parsePayload<TradeEntry>(row.payloadJson));
  const exitPrice = input.exitPrice ?? trade.currentPrice ?? null;
  const profit = calculatePaperTradeProfit(trade, exitPrice);

  const ledgerEntry: LedgerEntry = {
    ...trade,
    ledgerId: randomUUID(),
    recordType: "Closed Trade",
    exitDate: new Date().toISOString(),
    exitPrice,
    profitLoss: profit.profitLoss,
    profitLossPercent: profit.profitLossPercent,
    outcome,
    notes: input.notes ?? trade.notes,
    updatedAt: new Date().toISOString(),
  };

  await db.$transaction([
    db.tradeLifecycleEntry.delete({
      where: { id },
    }),
    db.tradeLifecycleEntry.create({
      data: lifecycleRowInput(KIND_LEDGER, ledgerEntry),
    }),
  ]);

  return ledgerEntry;
}

function buildTradeEntry(
  entry: WatchlistEntry,
  input: {
    entryPrice?: number | null;
    quantity?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    fees?: number | null;
    slippage?: number | null;
    notes?: string;
  }
): TradeEntry {
  return withPaperTradeProfit({
    ...entry,
    status: "Triggered",
    entryDate: new Date().toISOString(),
    entryPrice: input.entryPrice ?? entry.startPrice,
    currentPrice: input.entryPrice ?? entry.startPrice,
    currentProfitLoss: null,
    currentProfitLossPercent: null,
    quantity: input.quantity ?? 1,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    fees: input.fees ?? 0,
    slippage: input.slippage ?? 0,
    notes: input.notes ?? "",
    updatedAt: new Date().toISOString(),
  });
}

function buildLedgerEntry(entry: WatchlistEntry, status: "Invalidated" | "Expired"): LedgerEntry {
  const now = new Date().toISOString();

  return {
    ...entry,
    status,
    ledgerId: randomUUID(),
    recordType: status === "Invalidated" ? "Invalidated Setup" : "Expired Setup",
    ...(status === "Invalidated"
      ? { dateInvalidated: now, invalidationReason: entry.invalidation }
      : { expirationDate: now }),
    updatedAt: now,
  };
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
    riskExplanation:
      typeof entry.riskExplanation === "string" ? entry.riskExplanation : undefined,
    news: Array.isArray(entry.news)
      ? entry.news.map((item) => ({
          headline: typeof item?.headline === "string" ? item.headline : undefined,
          source: typeof item?.source === "string" ? item.source : undefined,
          url: typeof item?.url === "string" ? item.url : undefined,
        }))
      : [],
    timeHorizon: normalizeSheetsHorizon(entry.timeHorizon),
    status: normalizeWatchlistStatus(entry.status),
    createdAt,
    updatedAt: entry.updatedAt ?? createdAt,
  };
}

function normalizeTradeEntry(entry: TradeEntry): TradeEntry {
  const normalized = normalizeStoredEntry(entry);
  const trade = {
    ...normalized,
    ...entry,
    status: "Triggered" as const,
    entryDate: entry.entryDate ?? normalized.updatedAt,
    entryPrice: typeof entry.entryPrice === "number" ? entry.entryPrice : normalized.startPrice,
    currentPrice: typeof entry.currentPrice === "number" ? entry.currentPrice : normalized.startPrice,
    quantity: typeof entry.quantity === "number" ? entry.quantity : 1,
    stopLoss: typeof entry.stopLoss === "number" ? entry.stopLoss : null,
    takeProfit: typeof entry.takeProfit === "number" ? entry.takeProfit : null,
    fees: typeof entry.fees === "number" ? entry.fees : 0,
    slippage: typeof entry.slippage === "number" ? entry.slippage : 0,
    notes: entry.notes ?? "",
  };

  return withPaperTradeProfit(trade);
}

function normalizeLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return {
    ...normalizeStoredEntry(entry),
    ...entry,
    ledgerId: entry.ledgerId ?? randomUUID(),
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

function lifecycleRowInput(kind: string, entry: WatchlistEntry | TradeEntry | LedgerEntry) {
  return {
    id: entry.id,
    kind,
    symbol: entry.symbol.toUpperCase(),
    status: entry.status,
    ledgerId: "ledgerId" in entry ? entry.ledgerId : null,
    payloadJson: JSON.stringify(entry),
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  };
}

function lifecycleRowUpdate(kind: string, entry: WatchlistEntry | TradeEntry | LedgerEntry) {
  return {
    kind,
    symbol: entry.symbol.toUpperCase(),
    status: entry.status,
    ledgerId: "ledgerId" in entry ? entry.ledgerId : null,
    payloadJson: JSON.stringify(entry),
    updatedAt: new Date(entry.updatedAt),
  };
}

function parsePayload<T>(payloadJson: string): T {
  return JSON.parse(payloadJson) as T;
}

function withPaperTradeProfit<T extends TradeEntry>(trade: T): T {
  const profit = calculatePaperTradeProfit(trade, trade.currentPrice);

  return {
    ...trade,
    currentProfitLoss: profit.profitLoss,
    currentProfitLossPercent: profit.profitLossPercent,
  };
}

function calculatePaperTradeProfit(
  trade: {
    entryPrice?: number | null;
    quantity?: number | null;
    fees?: number | null;
    slippage?: number | null;
  },
  price?: number | null
) {
  const entryPrice = trade.entryPrice;

  if (typeof price !== "number" || typeof entryPrice !== "number") {
    return {
      profitLoss: null,
      profitLossPercent: null,
    };
  }

  const quantity = typeof trade.quantity === "number" ? trade.quantity : 1;
  const fees = typeof trade.fees === "number" ? trade.fees : 0;
  const slippage = typeof trade.slippage === "number" ? trade.slippage : 0;
  const grossProfitLoss = (price - entryPrice) * quantity;
  const profitLoss = grossProfitLoss - fees - slippage;
  const basis = entryPrice * quantity;

  return {
    profitLoss,
    profitLossPercent: basis !== 0 ? profitLoss / basis : null,
  };
}
