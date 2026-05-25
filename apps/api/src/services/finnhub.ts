// apps/api/src/services/finnhub.ts

export type FinnhubQuote = {
  source: "finnhub";
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

type FinnhubQuoteResponse = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote> {
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    throw new Error("Missing FINNHUB_API_KEY");
  }

  const cleanSymbol = symbol.trim().toUpperCase();

  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(
    cleanSymbol
  )}&token=${encodeURIComponent(token)}`;

  const response = await fetch(url);

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
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    throw new Error("Missing FINNHUB_API_KEY");
  }

  const cleanSymbol = symbol.trim().toUpperCase();

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

  const response = await fetch(url);

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