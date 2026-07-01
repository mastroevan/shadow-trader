// apps/api/src/utils/signals.ts

import type { Instrument, MarketCandle, MarketQuote } from "../types/market";

export type MarketSignal = {
  type:
    | "INTRADAY_MOMENTUM"
    | "VWAP_POSITION"
    | "EMA_ALIGNMENT"
    | "RSI_14"
    | "VOLUME_SPIKE"
    | "RANGE_BREAKOUT"
    | "SPREAD_LIQUIDITY"
    | "QUOTE_HEALTH"
    | "NEWS_SENTIMENT";
  label: string;
  value: number | string;
  unit?: "percent" | "price" | "ratio" | "score" | "status";
  interpretation: string;
};

export type NewsItem = {
  headline?: string;
  summary?: string;
};

type GenerateSignalsInput = {
  instrument: Instrument;
  quote: MarketQuote;
  candles?: MarketCandle[];
  news?: NewsItem[];
};

export function generateSignals({
  instrument,
  quote,
  candles = [],
  news = [],
}: GenerateSignalsInput): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const completeCandles = candles.filter((candle) => candle.close > 0);
  const latestCandle = completeCandles[completeCandles.length - 1];
  const latestPrice = quote.price || latestCandle?.close || 0;

  if (completeCandles.length >= 2 && latestPrice > 0) {
    const firstClose = completeCandles[0].close;
    const momentumPct = firstClose > 0 ? ((latestPrice - firstClose) / firstClose) * 100 : 0;

    signals.push({
      type: "INTRADAY_MOMENTUM",
      label: `${instrument.timeframe} intraday momentum`,
      value: Number(momentumPct.toFixed(2)),
      unit: "percent",
      interpretation:
        momentumPct > 0.75
          ? "Price is showing bullish intraday follow-through from the session sample."
          : momentumPct < -0.75
            ? "Price is showing bearish intraday pressure from the session sample."
            : "Intraday price movement is contained and does not show strong directional follow-through.",
    });
  }

  const vwap = calculateVwap(completeCandles);
  if (vwap && latestPrice > 0) {
    const distancePct = ((latestPrice - vwap) / vwap) * 100;

    signals.push({
      type: "VWAP_POSITION",
      label: "Price vs intraday VWAP",
      value: Number(distancePct.toFixed(2)),
      unit: "percent",
      interpretation:
        distancePct > 0.25
          ? `Price is above VWAP (${vwap.toFixed(2)}), favoring long-biased intraday setups.`
          : distancePct < -0.25
            ? `Price is below VWAP (${vwap.toFixed(2)}), favoring short-biased intraday setups.`
            : `Price is near VWAP (${vwap.toFixed(2)}), suggesting a balanced tape.`,
    });
  }

  const closes = completeCandles.map((candle) => candle.close);
  const ema9 = calculateEma(closes, 9);
  const ema20 = calculateEma(closes, 20);
  if (ema9 && ema20) {
    const spreadPct = ((ema9 - ema20) / ema20) * 100;

    signals.push({
      type: "EMA_ALIGNMENT",
      label: "EMA 9/20 alignment",
      value: Number(spreadPct.toFixed(2)),
      unit: "percent",
      interpretation:
        spreadPct > 0.1
          ? `EMA 9 is above EMA 20, showing short-term bullish trend alignment.`
          : spreadPct < -0.1
            ? `EMA 9 is below EMA 20, showing short-term bearish trend alignment.`
            : "EMA 9 and EMA 20 are tightly aligned, suggesting no clear short-term trend edge.",
    });
  }

  const rsi = calculateRsi(closes, 14);
  if (rsi !== null) {
    signals.push({
      type: "RSI_14",
      label: "RSI 14",
      value: Number(rsi.toFixed(2)),
      unit: "score",
      interpretation:
        rsi >= 70
          ? "RSI is elevated; momentum is strong but pullback risk is higher."
          : rsi <= 30
            ? "RSI is depressed; downside momentum is extended and reversal risk is higher."
            : "RSI is in a neutral range.",
    });
  }

  if (completeCandles.length >= 6) {
    const latestVolume = latestCandle?.volume ?? 0;
    const previousVolumes = completeCandles.slice(-21, -1).map((candle) => candle.volume).filter((volume) => volume > 0);
    const averageVolume = average(previousVolumes);

    if (latestVolume > 0 && averageVolume > 0) {
      const ratio = latestVolume / averageVolume;

      signals.push({
        type: "VOLUME_SPIKE",
        label: "Latest candle volume spike",
        value: Number(ratio.toFixed(2)),
        unit: "ratio",
        interpretation:
          ratio >= 2
            ? "Latest candle volume is materially above the recent baseline."
            : ratio >= 1.25
              ? "Latest candle volume is moderately above the recent baseline."
              : "Latest candle volume is close to the recent baseline.",
      });
    }
  }

  if (completeCandles.length >= 6 && latestCandle) {
    const lookback = completeCandles.slice(-21, -1);
    const resistance = Math.max(...lookback.map((candle) => candle.high));
    const support = Math.min(...lookback.map((candle) => candle.low));

    if (Number.isFinite(resistance) && Number.isFinite(support)) {
      const breakoutPct = latestCandle.close > resistance
        ? ((latestCandle.close - resistance) / resistance) * 100
        : latestCandle.close < support
          ? ((latestCandle.close - support) / support) * 100
          : 0;

      signals.push({
        type: "RANGE_BREAKOUT",
        label: "Intraday range break",
        value: Number(breakoutPct.toFixed(2)),
        unit: "percent",
        interpretation:
          latestCandle.close > resistance
            ? "Latest close is breaking above the recent intraday range."
            : latestCandle.close < support
              ? "Latest close is breaking below the recent intraday range."
              : "Latest close remains inside the recent intraday range.",
      });
    }
  }

  if (quote.bid && quote.ask && latestPrice > 0) {
    const spreadPct = ((quote.ask - quote.bid) / latestPrice) * 100;

    signals.push({
      type: "SPREAD_LIQUIDITY",
      label: "Bid/ask spread",
      value: Number(spreadPct.toFixed(3)),
      unit: "percent",
      interpretation:
        spreadPct <= 0.05
          ? "Bid/ask spread is tight for intraday execution."
          : spreadPct <= 0.2
            ? "Bid/ask spread is moderate; account for execution friction."
            : "Bid/ask spread is wide; avoid assuming clean intraday fills.",
    });
  }

  signals.push({
    type: "QUOTE_HEALTH",
    label: "Quote health",
    value: quote.timestamp > 0 ? "valid" : "stale_or_missing",
    unit: "status",
    interpretation:
      quote.timestamp > 0
        ? `${quote.source} returned a usable quote timestamp.`
        : "Quote timestamp is missing or stale.",
  });

  if (news.length > 0) {
    const sentimentScore = scoreNewsSentiment(news);

    signals.push({
      type: "NEWS_SENTIMENT",
      label: "Recent news sentiment",
      value: sentimentScore,
      unit: "score",
      interpretation:
        sentimentScore > 0
          ? "Recent headlines skew positive."
          : sentimentScore < 0
            ? "Recent headlines skew negative."
            : "Recent headlines appear neutral.",
    });
  }

  return signals;
}

function calculateVwap(candles: MarketCandle[]): number | null {
  let weightedPriceVolume = 0;
  let totalVolume = 0;

  for (const candle of candles) {
    if (candle.volume <= 0) continue;

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    weightedPriceVolume += typicalPrice * candle.volume;
    totalVolume += candle.volume;
  }

  return totalVolume > 0 ? weightedPriceVolume / totalVolume : null;
}

function calculateEma(values: number[], period: number): number | null {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));

  for (const value of values.slice(period)) {
    ema = (value - ema) * multiplier + ema;
  }

  return ema;
}

function calculateRsi(values: number[], period: number): number | null {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) return 100;

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreNewsSentiment(news: NewsItem[]): number {
  const positiveWords = [
    "beat",
    "beats",
    "record revenue",
    "record",
    "growth",
    "upgrade",
    "upgrades",
    "surge",
    "surges",
    "strong",
    "profit",
    "profits",
    "bullish",
    "raises",
    "raised guidance",
    "guidance raised",
    "partnership",
    "expansion",
    "ai demand",
    "demand",
    "outperform",
  ];

  const negativeWords = [
    "miss",
    "misses",
    "lawsuit",
    "investigation",
    "downgrade",
    "downgrades",
    "drop",
    "drops",
    "weak",
    "weak demand",
    "loss",
    "losses",
    "bearish",
    "cuts",
    "guidance cut",
    "cut guidance",
    "warning",
    "layoffs",
    "decline",
    "declines",
    "underperform",
  ];

  let score = 0;

  for (const item of news) {
    const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();

    for (const word of positiveWords) {
      if (text.includes(word)) score += 1;
    }

    for (const word of negativeWords) {
      if (text.includes(word)) score -= 1;
    }
  }

  return score;
}
