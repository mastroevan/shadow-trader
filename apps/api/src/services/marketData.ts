import axios from 'axios';
import { MarketSignal, NewsItem } from '../types';

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        currency?: string;
        symbol?: string;
      };
      indicators?: {
        quote?: Array<{
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
};

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
  'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
};

// --- Price Data ---

export async function getLatestQuote(symbol: string) {
  try {
    const res = await axios.get(
      `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
      { headers: ALPACA_HEADERS, timeout: 15000 }
    );

    return {
      source: 'alpaca',
      symbol,
      price: res.data.quote?.ap ?? null,
      volume: null,
    };
  } catch {
    console.warn(`Alpaca failed for ${symbol}, trying Finnhub...`);
  }

  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`,
      { timeout: 15000 }
    );

    return {
      source: 'finnhub',
      symbol,
      price: res.data.c ?? null,
      previousClose: res.data.pc ?? null,
      volume: null,
    };
  } catch {
    console.warn(`Finnhub failed for ${symbol}, trying Yahoo chart API...`);
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await axios.get<YahooChartResponse>(url, { timeout: 15000 });
  const result = res.data.chart?.result?.[0];

  if (!result) {
    throw new Error(`No quote data returned for ${symbol}`);
  }

  return {
    source: 'yahoo-chart-api',
    symbol: result.meta?.symbol ?? symbol,
    price: result.meta?.regularMarketPrice ?? null,
    previousClose: result.meta?.previousClose ?? null,
    currency: result.meta?.currency ?? 'USD',
    volume: null,
  };
}

// --- Volume Anomaly Detection ---

export async function detectVolumeAnomaly(symbol: string): Promise<MarketSignal | null> {
  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    const res = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}` +
        `?apiKey=${process.env.POLYGON_API_KEY}&sort=desc&limit=30`,
      { timeout: 15000 }
    );

    const bars = res.data.results;
    if (!bars || bars.length < 5) return null;

    const avgVolume = bars.slice(1).reduce((sum: number, bar: any) => sum + bar.v, 0) / (bars.length - 1);
    const todayVolume = bars[0].v;
    const ratio = todayVolume / avgVolume;

    if (ratio > 2.0) {
      return {
        symbol,
        signalType: 'VOLUME_ANOMALY',
        severity: ratio > 4 ? 'HIGH' : ratio > 2.5 ? 'MEDIUM' : 'LOW',
        value: todayVolume,
        baseline: avgVolume,
        percentChange: (ratio - 1) * 100,
        timestamp: new Date().toISOString(),
        source: 'polygon',
      };
    }

    return null;
  } catch {
    console.warn(`Polygon failed for ${symbol}, trying Yahoo chart API volume...`);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const res = await axios.get<YahooChartResponse>(url, { timeout: 15000 });
    const result = res.data.chart?.result?.[0];
    const volumes = result?.indicators?.quote?.[0]?.volume?.filter(
      (volume): volume is number => typeof volume === 'number'
    );

    if (!volumes || volumes.length < 5) return null;

    const todayVolume = volumes[volumes.length - 1];
    const previousVolumes = volumes.slice(0, -1);
    const avgVolume = previousVolumes.reduce((sum, volume) => sum + volume, 0) / previousVolumes.length;
    const ratio = todayVolume / avgVolume;

    if (ratio <= 1.5) return null;

    return {
      symbol,
      signalType: 'VOLUME_ANOMALY',
      severity: ratio > 4 ? 'HIGH' : ratio > 2.5 ? 'MEDIUM' : 'LOW',
      value: todayVolume,
      baseline: avgVolume,
      percentChange: (ratio - 1) * 100,
      timestamp: new Date().toISOString(),
      source: 'yahoo-chart-api',
    };
  } catch (err) {
    console.error('Volume anomaly detection failed:', err);
    return null;
  }
}

// --- News Headlines ---

export async function getNewsForSymbol(symbol: string, limit = 5): Promise<NewsItem[]> {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}` +
        `&from=${new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0]}` +
        `&to=${new Date().toISOString().split('T')[0]}` +
        `&token=${process.env.FINNHUB_API_KEY}`,
      { timeout: 15000 }
    );

    return res.data.slice(0, limit).map((item: any) => ({
      headline: item.headline ?? 'Untitled news item',
      source: item.source ?? 'unknown',
      publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
      sentiment: 'neutral',
    }));
  } catch {
    return [];
  }
}

// --- Sentiment Score ---

export async function getSentimentScore(symbol: string): Promise<number> {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`,
      { timeout: 15000 }
    );

    return res.data.companyNewsScore || 0.5;
  } catch {
    return 0.5;
  }
}