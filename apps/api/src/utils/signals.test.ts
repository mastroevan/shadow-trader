import assert from "node:assert/strict";
import test from "node:test";
import { generateSignals } from "./signals";
import type { Instrument, MarketCandle, MarketQuote } from "../types/market";

const instrument: Instrument = {
  assetClass: "crypto",
  symbol: "BTC-USD",
  displaySymbol: "BTC/USD",
  baseAsset: "BTC",
  quoteAsset: "USD",
  exchange: "coinbase",
  timeframe: "5m",
};

const candles: MarketCandle[] = Array.from({ length: 24 }, (_, index) => {
  const open = 100 + index;
  const close = open + 0.5;

  return {
    timestamp: 1_700_000_000 + index * 300,
    open,
    high: close + 0.4,
    low: open - 0.4,
    close,
    volume: index === 23 ? 500 : 100,
  };
});

const quote: MarketQuote = {
  source: "coinbase-exchange",
  symbol: "BTC-USD",
  assetClass: "crypto",
  price: candles[candles.length - 1].close,
  high: 124,
  low: 99,
  open: 100,
  previousClose: 99,
  timestamp: candles[candles.length - 1].timestamp,
  bid: 123.49,
  ask: 123.51,
  volume: 500,
  currency: "USD",
  raw: {},
};

test("generateSignals returns intraday setup indicators", () => {
  const signals = generateSignals({
    instrument,
    quote,
    candles,
  });
  const signalTypes = signals.map((signal) => signal.type);

  assert(signalTypes.includes("INTRADAY_MOMENTUM"));
  assert(signalTypes.includes("VWAP_POSITION"));
  assert(signalTypes.includes("EMA_ALIGNMENT"));
  assert(signalTypes.includes("RSI_14"));
  assert(signalTypes.includes("VOLUME_SPIKE"));
  assert(signalTypes.includes("RANGE_BREAKOUT"));
  assert(signalTypes.includes("SPREAD_LIQUIDITY"));
  assert(signalTypes.includes("QUOTE_HEALTH"));
  assert(!signalTypes.includes("SMA_TREND" as never));
  assert(!signalTypes.includes("PRICE_CHANGE" as never));
});
