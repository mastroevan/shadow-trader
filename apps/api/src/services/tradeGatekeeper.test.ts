import assert from "node:assert/strict";
import test from "node:test";
import { tradeRiskConfig } from "./tradeRiskConfig";
import {
  calculatePositionSize,
  calculateRiskReward,
  evaluateTradeGate,
  isTickerOnCooldown,
} from "./tradeGatekeeper";

test("calculateRiskReward returns reward divided by risk", () => {
  assert.equal(calculateRiskReward(100, 95, 112), 2.4);
  assert.equal(calculateRiskReward(100, 100, 112), 0);
  assert.equal(calculateRiskReward(null, 95, 112), 0);
});

test("calculatePositionSize sizes from max dollar risk", () => {
  assert.deepEqual(calculatePositionSize(10_000, 1, 100, 95), {
    positionSize: 20,
    maxDollarRisk: 100,
    riskPerShare: 5,
  });
  assert.equal(calculatePositionSize(10_000, 1, 100, 100).positionSize, 0);

  // Crypto fractional sizing
  const cryptoSize = calculatePositionSize(10_000, 1, 65_000, 64_000, { isCrypto: true });
  assert.equal(cryptoSize.positionSize, 0.1);
  assert.equal(cryptoSize.maxDollarRisk, 100);
  assert.equal(cryptoSize.riskPerShare, 1000);
});

test("evaluateTradeGate approves crypto setups with fractional size", () => {
  const result = evaluateTradeGate({
    symbol: "BTC/USD",
    entryPrice: 65_000,
    stopLoss: 64_000,
    takeProfit: 68_000,
    confidenceScore: 0.85,
    volumeConfirmation: true,
    trendStrength: 0.8,
  });

  assert.equal(result.approved, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.calculated.positionSize, 0.1);
});

test("evaluateTradeGate approves only validated candidates", () => {
  const result = evaluateTradeGate({
    symbol: "NVDA",
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 112,
    confidenceScore: 0.8,
    volumeConfirmation: true,
    trendStrength: 0.8,
  });

  assert.equal(result.approved, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.calculated.positionSize, 20);
});

test("evaluateTradeGate returns human-readable rejection reasons", () => {
  const result = evaluateTradeGate({
    symbol: "NVDA",
    entryPrice: 100,
    stopLoss: 99,
    takeProfit: 101,
    confidenceScore: 0.6,
    volumeConfirmation: false,
  });

  assert.equal(result.approved, false);
  assert(result.reasons.includes("Confidence score below 75%"));
  assert(result.reasons.includes("Risk/reward below 2:1"));
  assert(result.reasons.includes("No volume confirmation"));
  assert(result.reasons.includes("Trend strength below 0.6"));
  assert.equal(result.checklist.length, 7);
  assert.equal(result.checklist.find((c) => c.id === "confidence")?.passed, false);
  assert.equal(result.checklist.find((c) => c.id === "volume")?.passed, false);
  assert.equal(result.checklist.find((c) => c.id === "cooldown")?.passed, true);
});

test("isTickerOnCooldown only flags recent losses", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  assert.equal(
    isTickerOnCooldown("NVDA", [{ symbol: "NVDA", outcome: "Loss", closedAt: "2026-07-07T00:30:00.000Z" }], now),
    true
  );
  assert.equal(
    isTickerOnCooldown("NVDA", [{ symbol: "NVDA", outcome: "Win", closedAt: "2026-07-07T00:30:00.000Z" }], now),
    false
  );
  assert.equal(
    isTickerOnCooldown("NVDA", [{ symbol: "NVDA", outcome: "Loss", closedAt: "2026-07-05T00:30:00.000Z" }], now),
    false
  );
});

const passingCandidate = {
  symbol: "NVDA",
  entryPrice: 100,
  stopLoss: 95,
  takeProfit: 112,
  confidenceScore: 0.8,
  trendStrength: 0.8,
};

function withConfig<K extends keyof typeof tradeRiskConfig>(key: K, value: number, fn: () => void) {
  const previous = tradeRiskConfig[key];
  tradeRiskConfig[key] = value;
  try {
    fn();
  } finally {
    tradeRiskConfig[key] = previous;
  }
}

test("evaluateTradeGate checks volumeRatio against MIN_VOLUME_RATIO", () => {
  withConfig("minVolumeRatio", 1.5, () => {
    const below = evaluateTradeGate({ ...passingCandidate, volumeRatio: 1.3, volumeConfirmation: true });
    assert.equal(below.approved, false);
    assert(below.reasons.includes("No volume confirmation"));
    const volumeItem = below.checklist.find((item) => item.id === "volume");
    assert.equal(volumeItem?.actual, "1.30x");
    assert.equal(volumeItem?.threshold, ">= 1.5x volume spike");

    const above = evaluateTradeGate({ ...passingCandidate, volumeRatio: 1.6 });
    assert.equal(above.approved, true);
  });
});

test("evaluateTradeGate falls back to volumeConfirmation for entries without a ratio", () => {
  assert.equal(evaluateTradeGate({ ...passingCandidate, volumeConfirmation: true }).approved, true);
  assert.equal(evaluateTradeGate({ ...passingCandidate, volumeConfirmation: false }).approved, false);
});

test("evaluateTradeGate checks trendStrength against MIN_TREND_STRENGTH", () => {
  withConfig("minTrendStrength", 0.4, () => {
    const weak = evaluateTradeGate({ ...passingCandidate, volumeRatio: 2, trendStrength: 0.3 });
    assert.equal(weak.approved, false);
    assert(weak.reasons.includes("Trend strength below 0.4"));

    const strong = evaluateTradeGate({ ...passingCandidate, volumeRatio: 2, trendStrength: 0.45 });
    assert.equal(strong.approved, true);
  });

  const missing = evaluateTradeGate({ ...passingCandidate, volumeRatio: 2, trendStrength: null });
  assert.equal(missing.approved, false);
  assert.equal(missing.checklist.find((item) => item.id === "trend")?.actual, "N/A");
});
