import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import type { Instrument, MarketCandle, MarketNewsItem, MarketQuote, TechnicalIndicators, Timeframe } from "../../types/market";

type CoinbaseTickerResponse = {
  price?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  time?: string;
};

type CoinbaseStatsResponse = {
  open?: string;
  high?: string;
  low?: string;
  volume?: string;
  last?: string;
};

type CoinbaseCandle = [
  time: number,
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number
];

const COINBASE_EXCHANGE_BASE_URL = "https://api.exchange.coinbase.com";

export async function getCryptoQuote(instrument: Instrument): Promise<MarketQuote> {
  if (!instrument.baseAsset || !instrument.quoteAsset) {
    throw new Error("Crypto instruments require baseAsset and quoteAsset.");
  }

  const productId = getCoinbaseProductId(instrument);
  const [ticker, stats, candles] = await Promise.all([
    getCoinbaseJson<CoinbaseTickerResponse>(`/products/${productId}/ticker`),
    getCoinbaseJson<CoinbaseStatsResponse>(`/products/${productId}/stats`),
    getCoinbaseCandles(productId, 86400),
  ]);
  const latestCandle = candles[0];
  const previousCandle = candles[1];
  const price = toNumber(ticker.price ?? stats.last);
  const previousClose = toNumber(previousCandle?.[4]) || toNumber(stats.open);
  const open = toNumber(latestCandle?.[3]) || toNumber(stats.open) || price;
  const high = toNumber(stats.high) || toNumber(latestCandle?.[2]) || price;
  const low = toNumber(stats.low) || toNumber(latestCandle?.[1]) || price;
  const timestamp = ticker.time ? Math.floor(new Date(ticker.time).getTime() / 1000) : latestCandle?.[0] ?? 0;

  return {
    source: "coinbase-exchange",
    symbol: productId,
    assetClass: "crypto",
    price,
    high,
    low,
    open,
    previousClose,
    timestamp,
    bid: toNullableNumber(ticker.bid),
    ask: toNullableNumber(ticker.ask),
    volume: toNullableNumber(ticker.volume ?? stats.volume),
    currency: instrument.quoteAsset,
    raw: {
      ticker,
      stats,
      latestCandle,
      previousCandle,
    },
  };
}

export async function getCryptoNews(_instrument: Instrument): Promise<MarketNewsItem[]> {
  return [];
}

export async function getCryptoTechnicalIndicators(
  instrument: Instrument
): Promise<TechnicalIndicators | null> {
  if (!instrument.baseAsset || !instrument.quoteAsset) {
    return null;
  }

  try {
    const candles = await getCoinbaseCandles(getCoinbaseProductId(instrument), 86400);
    const closes = candles
      .map((candle) => candle[4])
      .filter((close) => Number.isFinite(close) && close > 0)
      .slice(0, 20);

    if (closes.length < 10) {
      return null;
    }

    const sma20 = closes.reduce((sum, close) => sum + close, 0) / closes.length;

    return {
      sma20: Number(sma20.toFixed(2)),
      closeCount: closes.length,
      source: "coinbase-exchange",
    };
  } catch {
    return null;
  }
}

export async function getCryptoCandles(instrument: Instrument): Promise<MarketCandle[]> {
  if (!instrument.baseAsset || !instrument.quoteAsset) {
    return [];
  }

  try {
    const candles = await getCoinbaseCandles(
      getCoinbaseProductId(instrument),
      getCoinbaseGranularity(instrument.timeframe)
    );

    return candles
      .map((candle) => ({
        timestamp: candle[0],
        low: candle[1],
        high: candle[2],
        open: candle[3],
        close: candle[4],
        volume: candle[5],
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

function getCoinbaseProductId(instrument: Instrument) {
  return `${instrument.baseAsset}-${instrument.quoteAsset}`;
}

function getCoinbaseGranularity(timeframe: Timeframe) {
  if (timeframe === "1m") return 60;
  if (timeframe === "15m") return 900;
  if (timeframe === "1h") return 3600;
  if (timeframe === "1d") return 86400;

  return 300;
}

async function getCoinbaseJson<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${COINBASE_EXCHANGE_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "shadow-trader-api",
    },
  });

  if (!response.ok) {
    throw new Error(`Coinbase Exchange request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function getCoinbaseCandles(productId: string, granularity: number): Promise<CoinbaseCandle[]> {
  const candles = await getCoinbaseJson<unknown>(
    `/products/${productId}/candles?granularity=${granularity}`
  );

  if (!Array.isArray(candles)) {
    return [];
  }

  return candles
    .filter((item): item is CoinbaseCandle => {
      return (
        Array.isArray(item) &&
        item.length >= 6 &&
        item.every((value) => typeof value === "number" && Number.isFinite(value))
      );
    })
    .sort((a, b) => b[0] - a[0]);
}

function toNumber(value: unknown): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toNullableNumber(value: unknown): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}
