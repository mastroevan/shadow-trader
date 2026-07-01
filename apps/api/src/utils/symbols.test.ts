import assert from "node:assert/strict";
import test from "node:test";
import { resolveInstrument } from "./symbols";

test("resolveInstrument keeps equity symbols as stock instruments by default", () => {
  assert.deepEqual(resolveInstrument({ symbol: "nvidia" }), {
    assetClass: "stock",
    symbol: "NVDA",
    displaySymbol: "NVDA",
    exchange: undefined,
    timeframe: "5m",
  });
});

test("resolveInstrument detects common crypto assets", () => {
  assert.deepEqual(resolveInstrument({ symbol: "btc" }), {
    assetClass: "crypto",
    symbol: "BTC-USD",
    displaySymbol: "BTC/USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    exchange: "coinbase",
    timeframe: "5m",
  });
});

test("resolveInstrument parses crypto pairs", () => {
  assert.deepEqual(resolveInstrument({ symbol: "eth/usdt", timeframe: "15m" }), {
    assetClass: "crypto",
    symbol: "ETH-USDT",
    displaySymbol: "ETH/USDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    exchange: "coinbase",
    timeframe: "15m",
  });
});

test("resolveInstrument honors explicit crypto asset class", () => {
  assert.deepEqual(resolveInstrument({ symbol: "sol", assetClass: "crypto", exchange: "coinbase" }), {
    assetClass: "crypto",
    symbol: "SOL-USD",
    displaySymbol: "SOL/USD",
    baseAsset: "SOL",
    quoteAsset: "USD",
    exchange: "coinbase",
    timeframe: "5m",
  });
});
