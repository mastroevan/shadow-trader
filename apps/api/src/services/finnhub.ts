// apps/api/src/services/finnhub.ts

import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export type FinnhubQuote = {
  source: "finnhub" | "yahoo-chart-api";
  symbol: string;
  price: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
  raw: FinnhubQuoteResponse;
};

export type FinnhubNewsItem = {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
};

export type TechnicalIndicators = {
  sma20: number | null;
  closeCount: number;
  source: "yahoo-chart-api";
};

type FinnhubQuoteResponse = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const MARKET_DATA_RETRIES = 2;

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote> {
  const cleanSymbol = symbol.trim().toUpperCase();

  try {
    return await withRetry(() => getFinnhubQuoteOnce(cleanSymbol), {
      attempts: MARKET_DATA_RETRIES,
      label: `Finnhub quote ${cleanSymbol}`,
    });
  } catch (error) {
    console.warn(
      `Finnhub quote failed for ${cleanSymbol}; trying Yahoo fallback:`,
      error
    );

    return getYahooQuoteFallback(cleanSymbol);
  }
}

async function getFinnhubQuoteOnce(cleanSymbol: string): Promise<FinnhubQuote> {
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    throw new Error("Missing FINNHUB_API_KEY");
  }

  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(
    cleanSymbol
  )}&token=${encodeURIComponent(token)}`;

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Finnhub quote request failed: ${response.status}`);
  }

  const data = (await response.json()) as FinnhubQuoteResponse;

  return {
    source: "finnhub",
    symbol: cleanSymbol,
    price: Number(data.c ?? 0),
    high: Number(data.h ?? 0),
    low: Number(data.l ?? 0),
    open: Number(data.o ?? 0),
    previousClose: Number(data.pc ?? 0),
    timestamp: Number(data.t ?? 0),
    raw: data,
  };
}

export async function getFinnhubCompanyNews(
  symbol: string
): Promise<FinnhubNewsItem[]> {
  const cleanSymbol = symbol.trim().toUpperCase();

  return withRetry(() => getFinnhubCompanyNewsOnce(cleanSymbol), {
    attempts: MARKET_DATA_RETRIES,
    label: `Finnhub company news ${cleanSymbol}`,
  });
}

async function getFinnhubCompanyNewsOnce(
  cleanSymbol: string
): Promise<FinnhubNewsItem[]> {
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    throw new Error("Missing FINNHUB_API_KEY");
  }

  const today = new Date();
  const from = new Date(today);

  from.setDate(today.getDate() - 7);

  const fromDate = from.toISOString().split("T")[0];
  const toDate = today.toISOString().split("T")[0];

  const url =
    `${FINNHUB_BASE_URL}/company-news` +
    `?symbol=${encodeURIComponent(cleanSymbol)}` +
    `&from=${encodeURIComponent(fromDate)}` +
    `&to=${encodeURIComponent(toDate)}` +
    `&token=${encodeURIComponent(token)}`;

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(
      `Finnhub company news request failed: ${response.status}`
    );
  }

  const data = (await response.json()) as unknown;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.slice(0, 10).map((item) => {
    const record = item as Partial<FinnhubNewsItem>;

    return {
      headline: String(record.headline ?? ""),
      summary: String(record.summary ?? ""),
      source: String(record.source ?? ""),
      url: String(record.url ?? ""),
      datetime: Number(record.datetime ?? 0),
    };
  });
}

async function getYahooQuoteFallback(cleanSymbol: string): Promise<FinnhubQuote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}` +
    "?range=5d&interval=1d";
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Yahoo quote fallback failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          regularMarketTime?: number;
          regularMarketDayHigh?: number;
          regularMarketDayLow?: number;
          regularMarketOpen?: number;
          chartPreviousClose?: number;
          previousClose?: number;
        };
      }>;
    };
  };
  const meta = data.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice ?? 0);
  const previousClose = Number(
    meta?.chartPreviousClose ?? meta?.previousClose ?? 0
  );

  return {
    source: "yahoo-chart-api",
    symbol: cleanSymbol,
    price,
    high: Number(meta?.regularMarketDayHigh ?? price),
    low: Number(meta?.regularMarketDayLow ?? price),
    open: Number(meta?.regularMarketOpen ?? price),
    previousClose,
    timestamp: Number(meta?.regularMarketTime ?? 0),
    raw: {
      c: price,
      h: Number(meta?.regularMarketDayHigh ?? price),
      l: Number(meta?.regularMarketDayLow ?? price),
      o: Number(meta?.regularMarketOpen ?? price),
      pc: previousClose,
      t: Number(meta?.regularMarketTime ?? 0),
    },
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; label: string }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < options.attempts) {
        console.warn(
          `${options.label} failed on attempt ${attempt}; retrying:`,
          error
        );
      }
    }
  }

  throw lastError;
}

export async function getTechnicalIndicators(
  symbol: string
): Promise<TechnicalIndicators | null> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}` +
    "?range=1mo&interval=1d";

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      chart?: {
        result?: Array<{
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const closes =
      data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(
        (close): close is number => typeof close === "number" && close > 0
      ) ?? [];

    const recentCloses = closes.slice(-20);

    if (recentCloses.length < 10) {
      return null;
    }

    const sma20 =
      recentCloses.reduce((sum, close) => sum + close, 0) / recentCloses.length;

    return {
      sma20: Number(sma20.toFixed(2)),
      closeCount: recentCloses.length,
      source: "yahoo-chart-api",
    };
  } catch {
    return null;
  }
}

export function isValidFinnhubQuote(
  quote: FinnhubQuote | null | undefined
): quote is FinnhubQuote {
  return Boolean(
    quote &&
      quote.price > 0 &&
      quote.previousClose > 0 &&
      quote.timestamp > 0
  );
}
