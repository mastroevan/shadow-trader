import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import {
  normalizeTimeHorizon,
  normalizeWatchlistStatus,
  type WatchlistStatus,
} from "./watchlistFields";
import {
  evaluateTradeGate,
  type GateStatus,
  type TradeGateEvaluation,
} from "./tradeGatekeeper";

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
  entryZone?: string;
  stopLossTrigger?: string;
  takeProfitTrigger?: string;
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
  entryPrice?: number | null;
  currentPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskRewardRatio?: number | null;
  volumeConfirmation?: boolean | null;
  trendStrength?: number | null;
  marketCondition?: string;
  triggerType?: string;
  positionSize?: number | null;
  maxDollarRisk?: number | null;
  riskPerShare?: number | null;
  gateStatus?: GateStatus;
  gateReasons?: string[];
  triggerPrice?: number | null;
  triggeredAt?: string;
  triggerReason?: string;
  triggerWarning?: string;
  triggerWarningAt?: string;
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
  stopLossHit: boolean;
  stopLossHitAt?: string;
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
  pnl?: number | null;
  closedAt?: string;
  lossReason?: string;
  stopLossHit?: boolean;
  timeInTrade?: string;
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
      status: {
        in: ["Watching", "Triggered Review", "Pending Confirmation"],
      },
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
  if (status === "Watching" || status === "Triggered Review" || status === "Pending Confirmation") return null;

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

export async function deleteLedgerEntry(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.tradeLifecycleEntry.deleteMany({
    where: {
      id,
      kind: KIND_LEDGER,
    },
  });

  return result.count > 0;
}

export async function clearLedgerEntries(): Promise<number> {
  const db = await getDb();
  const result = await db.tradeLifecycleEntry.deleteMany({
    where: {
      kind: KIND_LEDGER,
    },
  });

  return result.count;
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
  if (previousEntry.gateStatus !== "APPROVED") return null;
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

export async function markWatchlistEntryPendingConfirmation(
  id: string,
  input: {
    triggerPrice: number;
    triggerReason: string;
  }
): Promise<WatchlistEntry | null> {
  const db = await getDb();
  const [row, ledgerEntries] = await Promise.all([
    db.tradeLifecycleEntry.findUnique({ where: { id } }),
    listLedgerEntries(),
  ]);

  if (!row || row.kind !== KIND_WATCHLIST || row.status !== "Watching") return null;

  const current = normalizeStoredEntry(parsePayload<WatchlistEntry>(row.payloadJson));
  const entryPrice = input.triggerPrice;
  const stopLoss = current.stopLoss ?? parseFirstPriceLevel(current.stopLossTrigger);
  const takeProfit = current.takeProfit ?? parseFirstPriceLevel(current.takeProfitTrigger);
  const gate = evaluateTradeGate({
    symbol: current.symbol,
    direction: current.direction,
    entryPrice,
    stopLoss,
    takeProfit,
    confidenceScore: current.confidenceScore,
    volumeConfirmation: current.volumeConfirmation,
    trendStrength: current.trendStrength,
    closedTrades: ledgerEntries,
  });
  const now = new Date().toISOString();
  const nextEntry: WatchlistEntry = {
    ...current,
    status: "Triggered Review",
    entryPrice,
    currentPrice: entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: gate.calculated.riskRewardRatio,
    positionSize: gate.calculated.positionSize,
    maxDollarRisk: gate.calculated.maxDollarRisk,
    riskPerShare: gate.calculated.riskPerShare,
    gateStatus: gate.approved ? "APPROVED" : "REJECTED",
    gateReasons: gate.reasons,
    triggerPrice: input.triggerPrice,
    triggeredAt: now,
    triggerReason: input.triggerReason,
    updatedAt: now,
  };

  await db.tradeLifecycleEntry.update({
    where: { id },
    data: lifecycleRowUpdate(KIND_WATCHLIST, nextEntry),
  });

  return nextEntry;
}

export async function skipPendingWatchlistConfirmation(id: string): Promise<WatchlistEntry | null> {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id },
  });

  if (!row || row.kind !== KIND_WATCHLIST || (row.status !== "Triggered Review" && row.status !== "Pending Confirmation")) return null;

  const current = normalizeStoredEntry(parsePayload<WatchlistEntry>(row.payloadJson));
  const nextEntry: WatchlistEntry = {
    ...current,
    status: "Watching",
    entryPrice: null,
    currentPrice: null,
    positionSize: null,
    gateStatus: undefined,
    gateReasons: [],
    triggerPrice: null,
    triggeredAt: undefined,
    triggerReason: undefined,
    triggerWarning: undefined,
    triggerWarningAt: undefined,
    updatedAt: new Date().toISOString(),
  };

  await db.tradeLifecycleEntry.update({
    where: { id },
    data: lifecycleRowUpdate(KIND_WATCHLIST, nextEntry),
  });

  return nextEntry;
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
  const stopLossHit = isStopLossHit(current, nextPrice);
  const now = new Date().toISOString();
  const nextTrade = withPaperTradeProfit({
    ...current,
    currentPrice: nextPrice,
    notes: input.notes ?? current.notes,
    stopLoss: input.stopLoss ?? current.stopLoss,
    takeProfit: input.takeProfit ?? current.takeProfit,
    stopLossHit: current.stopLossHit || stopLossHit,
    stopLossHitAt: current.stopLossHitAt ?? (stopLossHit ? now : undefined),
    updatedAt: now,
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
  const closedAt = new Date().toISOString();

  const ledgerEntry: LedgerEntry = {
    ...trade,
    ledgerId: randomUUID(),
    recordType: "Closed Trade",
    exitDate: closedAt,
    closedAt,
    exitPrice,
    profitLoss: profit.profitLoss,
    pnl: profit.profitLoss,
    profitLossPercent: profit.profitLossPercent,
    outcome,
    lossReason: outcome === "Loss" ? buildLossReason(trade) : undefined,
    stopLossHit: trade.stopLossHit,
    timeInTrade: calculateTimeInTrade(trade.entryDate, closedAt),
    notes: input.notes ?? trade.notes,
    updatedAt: closedAt,
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
    entryPrice: input.entryPrice ?? entry.triggerPrice ?? entry.startPrice,
    currentPrice: input.entryPrice ?? entry.triggerPrice ?? entry.startPrice,
    currentProfitLoss: null,
    currentProfitLossPercent: null,
    quantity: input.quantity ?? entry.positionSize ?? 20,
    stopLoss: input.stopLoss ?? entry.stopLoss ?? parseFirstPriceLevel(entry.stopLossTrigger),
    takeProfit: input.takeProfit ?? entry.takeProfit ?? parseFirstPriceLevel(entry.takeProfitTrigger),
    positionSize: input.quantity ?? entry.positionSize ?? 20,
    fees: input.fees ?? 0,
    slippage: input.slippage ?? 0,
    stopLossHit: false,
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
    entryZone: typeof entry.entryZone === "string" ? entry.entryZone : undefined,
    stopLossTrigger:
      typeof entry.stopLossTrigger === "string" ? entry.stopLossTrigger : undefined,
    takeProfitTrigger:
      typeof entry.takeProfitTrigger === "string" ? entry.takeProfitTrigger : undefined,
    entryPrice: normalizeNumber(entry.entryPrice),
    currentPrice: normalizeNumber(entry.currentPrice),
    stopLoss: normalizeNumber(entry.stopLoss),
    takeProfit: normalizeNumber(entry.takeProfit),
    riskRewardRatio: normalizeNumber(entry.riskRewardRatio),
    volumeConfirmation:
      typeof entry.volumeConfirmation === "boolean" ? entry.volumeConfirmation : null,
    trendStrength: normalizeNumber(entry.trendStrength),
    marketCondition: typeof entry.marketCondition === "string" ? entry.marketCondition : undefined,
    triggerType: typeof entry.triggerType === "string" ? entry.triggerType : undefined,
    positionSize: normalizeNumber(entry.positionSize),
    maxDollarRisk: normalizeNumber(entry.maxDollarRisk),
    riskPerShare: normalizeNumber(entry.riskPerShare),
    gateStatus: entry.gateStatus === "APPROVED" || entry.gateStatus === "REJECTED" ? entry.gateStatus : undefined,
    gateReasons: Array.isArray(entry.gateReasons) ? entry.gateReasons.map(String) : [],
    triggerPrice:
      typeof entry.triggerPrice === "number" && Number.isFinite(entry.triggerPrice)
        ? entry.triggerPrice
        : null,
    triggeredAt: typeof entry.triggeredAt === "string" ? entry.triggeredAt : undefined,
    triggerReason: typeof entry.triggerReason === "string" ? entry.triggerReason : undefined,
    triggerWarning: typeof entry.triggerWarning === "string" ? entry.triggerWarning : undefined,
    triggerWarningAt: typeof entry.triggerWarningAt === "string" ? entry.triggerWarningAt : undefined,
    news: Array.isArray(entry.news)
      ? entry.news.map((item) => ({
          headline: typeof item?.headline === "string" ? item.headline : undefined,
          source: typeof item?.source === "string" ? item.source : undefined,
          url: typeof item?.url === "string" ? item.url : undefined,
        }))
      : [],
    timeHorizon: normalizeTimeHorizon(entry.timeHorizon),
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
    stopLoss: typeof entry.stopLoss === "number" ? entry.stopLoss : normalized.stopLoss ?? null,
    takeProfit: typeof entry.takeProfit === "number" ? entry.takeProfit : normalized.takeProfit ?? null,
    fees: typeof entry.fees === "number" ? entry.fees : 0,
    slippage: typeof entry.slippage === "number" ? entry.slippage : 0,
    positionSize: typeof entry.positionSize === "number" ? entry.positionSize : entry.quantity ?? normalized.positionSize ?? null,
    stopLossHit: entry.stopLossHit === true,
    stopLossHitAt: typeof entry.stopLossHitAt === "string" ? entry.stopLossHitAt : undefined,
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
    if ((entry.status !== "Watching" && entry.status !== "Triggered Review" && entry.status !== "Pending Confirmation") || seen.has(symbol)) continue;
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

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    direction?: string;
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
  const normalizedDirection = trade.direction?.toUpperCase() ?? "";
  const directionMultiplier =
    normalizedDirection.includes("BEAR") || normalizedDirection.includes("SHORT")
      ? -1
      : 1;
  const grossProfitLoss = (price - entryPrice) * quantity * directionMultiplier;
  const profitLoss = grossProfitLoss - fees - slippage;
  const basis = entryPrice * quantity;

  return {
    profitLoss,
    profitLossPercent: basis !== 0 ? profitLoss / basis : null,
  };
}

function isStopLossHit(trade: TradeEntry, price?: number | null) {
  if (typeof price !== "number" || typeof trade.stopLoss !== "number") return false;

  const normalizedDirection = trade.direction?.toUpperCase() ?? "";
  const isShort = normalizedDirection.includes("BEAR") || normalizedDirection.includes("SHORT");

  return isShort ? price >= trade.stopLoss : price <= trade.stopLoss;
}

function buildLossReason(trade: TradeEntry) {
  if (typeof trade.riskRewardRatio === "number" && trade.riskRewardRatio < 2) {
    return "Poor risk/reward setup";
  }

  if (trade.volumeConfirmation === false) {
    return "Weak or missing volume confirmation";
  }

  if (typeof trade.confidenceScore === "number" && trade.confidenceScore < 0.75) {
    return "Confidence score was below preferred threshold";
  }

  if (trade.stopLossHit) {
    return "Stop loss was hit";
  }

  return "Trade moved against thesis";
}

function calculateTimeInTrade(entryDate?: string | null, closedAt?: string) {
  if (!entryDate || !closedAt) return undefined;

  const start = new Date(entryDate).getTime();
  const end = new Date(closedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;

  const totalMinutes = Math.round((end - start) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

function parseFirstPriceLevel(value?: string): number | null {
  if (!value) return null;

  const matches = value.matchAll(/\$?\b\d+(?:,\d{3})*(?:\.\d+)?\b/g);

  for (const match of matches) {
    const raw = match[0];
    const nextCharacter = value[Number(match.index) + raw.length]?.toLowerCase();

    if (nextCharacter === "%" || nextCharacter === "r" || nextCharacter === "x") {
      continue;
    }

    const parsed = Number(raw.replace(/[$,]/g, ""));

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}
