import assert from "node:assert/strict";
import test from "node:test";
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
});

test("evaluateTradeGate approves only validated candidates", () => {
  const result = evaluateTradeGate({
    symbol: "NVDA",
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 112,
    confidenceScore: 0.8,
    volumeConfirmation: true,
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
