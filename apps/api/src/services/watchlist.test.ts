import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLossReason,
  calculatePaperTradeProfit,
  calculateTimeInTrade,
  dedupeActiveWatchlist,
  isStopLossHit,
  parseFirstPriceLevel,
  type TradeEntry,
  type WatchlistEntry,
} from "./watchlist";

function baseWatchlistEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: "entry-1",
    symbol: "NVDA",
    direction: "LONG",
    suggestedAction: "BUY",
    confidenceScore: 0.8,
    startPrice: 100,
    thesis: "test thesis",
    entryTrigger: "",
    invalidation: "",
    watchConditions: [],
    timeHorizon: "Day Trade",
    status: "Watching",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    ...baseWatchlistEntry(),
    status: "Triggered",
    entryDate: "2026-01-01T00:00:00.000Z",
    entryPrice: 100,
    currentPrice: 100,
    currentProfitLoss: null,
    currentProfitLossPercent: null,
    quantity: 10,
    stopLoss: 95,
    takeProfit: 112,
    fees: 0,
    slippage: 0,
    stopLossHit: false,
    notes: "",
    ...overrides,
  };
}

test("calculatePaperTradeProfit computes long P&L net of fees and slippage", () => {
  const result = calculatePaperTradeProfit(
    { direction: "LONG", entryPrice: 100, quantity: 10, fees: 2, slippage: 1 },
    110
  );

  assert.equal(result.profitLoss, 97);
  assert.equal(result.profitLossPercent, 97 / 1000);
});

test("calculatePaperTradeProfit inverts direction for short setups", () => {
  const result = calculatePaperTradeProfit(
    { direction: "SHORT", entryPrice: 100, quantity: 10, fees: 0, slippage: 0 },
    90
  );

  assert.equal(result.profitLoss, 100);
});

test("calculatePaperTradeProfit returns nulls when price or entry is missing", () => {
  assert.deepEqual(
    calculatePaperTradeProfit({ direction: "LONG", entryPrice: null }, 100),
    { profitLoss: null, profitLossPercent: null }
  );
  assert.deepEqual(
    calculatePaperTradeProfit({ direction: "LONG", entryPrice: 100 }, null),
    { profitLoss: null, profitLossPercent: null }
  );
});

test("isStopLossHit flags long trades when price drops to or below stop", () => {
  const trade = baseTrade({ direction: "LONG", stopLoss: 95 });

  assert.equal(isStopLossHit(trade, 95), true);
  assert.equal(isStopLossHit(trade, 96), false);
});

test("isStopLossHit flags short trades when price rises to or above stop", () => {
  const trade = baseTrade({ direction: "BEARISH", stopLoss: 105 });

  assert.equal(isStopLossHit(trade, 105), true);
  assert.equal(isStopLossHit(trade, 104), false);
});

test("isStopLossHit is false without a numeric price or stop", () => {
  const trade = baseTrade({ stopLoss: null });

  assert.equal(isStopLossHit(trade, 90), false);
  assert.equal(isStopLossHit(baseTrade({ stopLoss: 95 }), null), false);
});

test("buildLossReason prioritizes risk/reward, then volume, then confidence, then stop", () => {
  assert.equal(
    buildLossReason(baseTrade({ riskRewardRatio: 1.2 })),
    "Poor risk/reward setup"
  );
  assert.equal(
    buildLossReason(baseTrade({ riskRewardRatio: 2.5, volumeConfirmation: false })),
    "Weak or missing volume confirmation"
  );
  assert.equal(
    buildLossReason(
      baseTrade({ riskRewardRatio: 2.5, volumeConfirmation: true, confidenceScore: 0.5 })
    ),
    "Confidence score was below preferred threshold"
  );
  assert.equal(
    buildLossReason(
      baseTrade({
        riskRewardRatio: 2.5,
        volumeConfirmation: true,
        confidenceScore: 0.9,
        stopLossHit: true,
      })
    ),
    "Stop loss was hit"
  );
  assert.equal(
    buildLossReason(
      baseTrade({
        riskRewardRatio: 2.5,
        volumeConfirmation: true,
        confidenceScore: 0.9,
        stopLossHit: false,
      })
    ),
    "Trade moved against thesis"
  );
});

test("calculateTimeInTrade formats elapsed hours and minutes", () => {
  assert.equal(
    calculateTimeInTrade("2026-01-01T00:00:00.000Z", "2026-01-01T02:30:00.000Z"),
    "2h 30m"
  );
});

test("calculateTimeInTrade returns undefined for missing or inverted dates", () => {
  assert.equal(calculateTimeInTrade(undefined, "2026-01-01T00:00:00.000Z"), undefined);
  assert.equal(
    calculateTimeInTrade("2026-01-01T02:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    undefined
  );
});

test("parseFirstPriceLevel picks the first plain dollar amount", () => {
  assert.equal(parseFirstPriceLevel("Entry near $102.50, stop below $98"), 102.5);
});

test("parseFirstPriceLevel skips percentages and R-multiples", () => {
  assert.equal(parseFirstPriceLevel("Risk 2% then target 3R, exit at $145"), 145);
  assert.equal(parseFirstPriceLevel("2x volume confirmation only"), null);
});

test("parseFirstPriceLevel returns null when nothing parses", () => {
  assert.equal(parseFirstPriceLevel(undefined), null);
  assert.equal(parseFirstPriceLevel("no numbers here"), null);
});

test("dedupeActiveWatchlist keeps the newest active entry per symbol", () => {
  const entries = [
    baseWatchlistEntry({ id: "a", symbol: "nvda", status: "Watching" }),
    baseWatchlistEntry({ id: "b", symbol: "NVDA", status: "Triggered Review" }),
    baseWatchlistEntry({ id: "c", symbol: "AAPL", status: "Watching" }),
  ];

  const result = dedupeActiveWatchlist(entries);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["a", "c"]
  );
});

test("dedupeActiveWatchlist drops entries that aren't in an active status", () => {
  const entries = [baseWatchlistEntry({ status: "Invalidated" })];

  assert.deepEqual(dedupeActiveWatchlist(entries), []);
});
