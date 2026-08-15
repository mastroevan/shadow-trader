import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateEntryTrigger,
  evaluateExitTrigger,
  parsePriceLevels,
  selectEntryLevel,
} from "./automation";
import type { TradeEntry, WatchlistEntry } from "./watchlist";

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

test("parsePriceLevels extracts plain numbers and skips percent/R/x-suffixed ones", () => {
  assert.deepEqual(
    parsePriceLevels("Entry $100, stop $95, risk 2%, target 3R, size 2x"),
    [100, 95]
  );
});

test("parsePriceLevels returns an empty array for missing input", () => {
  assert.deepEqual(parsePriceLevels(undefined), []);
});

test("evaluateEntryTrigger fires a long setup once price crosses an explicit entry level", () => {
  const entry = baseWatchlistEntry({ direction: "LONG", entryTrigger: "Buy above $105" });

  assert.equal(evaluateEntryTrigger(entry, 104).triggered, false);
  const result = evaluateEntryTrigger(entry, 105);
  assert.equal(result.triggered, true);
  assert.match(result.reason, /crossed entry level/);
});

test("evaluateEntryTrigger fires a short setup once price drops to an explicit entry level", () => {
  const entry = baseWatchlistEntry({ direction: "SHORT", entryTrigger: "Sell below $95" });

  assert.equal(evaluateEntryTrigger(entry, 96).triggered, false);
  assert.equal(evaluateEntryTrigger(entry, 95).triggered, true);
});

test("evaluateEntryTrigger falls back to a percent move from start price when no explicit level is given", () => {
  const entry = baseWatchlistEntry({ direction: "LONG", entryTrigger: "", startPrice: 100 });

  assert.equal(evaluateEntryTrigger(entry, 100.5).triggered, false);
  assert.equal(evaluateEntryTrigger(entry, 101).triggered, true);
});

test("evaluateEntryTrigger never fires without an entry level or a positive start price", () => {
  const entry = baseWatchlistEntry({ entryTrigger: "", startPrice: null });

  assert.equal(evaluateEntryTrigger(entry, 500).triggered, false);
});

test("evaluateExitTrigger closes a long trade as a win at target", () => {
  const trade = baseTrade({ direction: "LONG", takeProfit: 112, stopLoss: 95 });
  const result = evaluateExitTrigger(trade, 112);

  assert.equal(result.triggered, true);
  assert.equal(result.outcome, "Win");
});

test("evaluateExitTrigger closes a long trade as a loss at stop", () => {
  const trade = baseTrade({ direction: "LONG", takeProfit: 112, stopLoss: 95 });
  const result = evaluateExitTrigger(trade, 95);

  assert.equal(result.triggered, true);
  assert.equal(result.outcome, "Loss");
});

test("evaluateExitTrigger inverts target/stop comparisons for short trades", () => {
  const trade = baseTrade({ direction: "SHORT", takeProfit: 90, stopLoss: 105 });

  assert.equal(evaluateExitTrigger(trade, 90).outcome, "Win");
  assert.equal(evaluateExitTrigger(trade, 105).outcome, "Loss");
});

test("evaluateExitTrigger does not trigger between stop and target", () => {
  const trade = baseTrade({ direction: "LONG", takeProfit: 112, stopLoss: 95 });

  assert.equal(evaluateExitTrigger(trade, 104).triggered, false);
});

test("selectEntryLevel picks the parsed level closest to the start price on the correct side", () => {
  const entry = baseWatchlistEntry({
    direction: "LONG",
    startPrice: 100,
    entryTrigger: "Buy above $102 or $110",
  });

  assert.equal(selectEntryLevel(entry, "long"), 102);
});

test("selectEntryLevel ignores levels on the wrong side of the start price", () => {
  const entry = baseWatchlistEntry({
    direction: "LONG",
    startPrice: 100,
    entryTrigger: "Buy above $90",
  });

  assert.equal(selectEntryLevel(entry, "long"), null);
});

test("selectEntryLevel falls back to the first parsed level when there is no start price", () => {
  const entry = baseWatchlistEntry({
    startPrice: null,
    entryTrigger: "Buy above $102",
  });

  assert.equal(selectEntryLevel(entry, "long"), 102);
});

test("selectEntryLevel returns null when nothing parses", () => {
  const entry = baseWatchlistEntry({ entryTrigger: "", entryZone: undefined });

  assert.equal(selectEntryLevel(entry, "long"), null);
});
