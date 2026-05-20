import axios from 'axios';
import yahooFinance from 'yahoo-finance2';
import { MarketSignal } from '../types';

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
  'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
};

// --- Price Data ---

export async function getLatestQuote(symbol: string) {
  try {
    const res = await axios.get(
      `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
      { headers: ALPACA_HEADERS }
    );
    return { source: 'alpaca', price: res.data.quote.ap, volume: null };
  } catch {
    console.warn(`Alpaca failed for ${symbol}, trying Finnhub...`);
  }

  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
    );
    return { source: 'finnhub', price: res.data.c, volume: null };
  } catch {
    console.warn(`Finnhub failed for ${symbol}, trying Yahoo...`);
  }

  // Yahoo Finance fallback
  const quote = await yahooFinance.quote(symbol);
  return { source: 'yahoo', price: quote.regularMarketPrice, volume: quote.regularMarketVolume };
}

// --- Volume Anomaly Detection ---

export async function detectVolumeAnomaly(symbol: string): Promise<MarketSignal | null> {
  try {
    // Get 30-day average volume from Polygon
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    
    const res = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}` +
      `?apiKey=${process.env.POLYGON_API_KEY}&sort=desc&limit=30`
    );

    const bars = res.data.results;
    if (!bars || bars.length < 5) return null;

    const avgVolume = bars.slice(1).reduce((s: number, b: any) => s + b.v, 0) / (bars.length - 1);
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
  } catch (err) {
    console.error('Volume anomaly detection failed:', err);
    return null;
  }
}

// --- News Headlines ---

export async function getNewsForSymbol(symbol: string, limit = 5) {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}` +
      `&from=${new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0]}` +
      `&to=${new Date().toISOString().split('T')[0]}` +
      `&token=${process.env.FINNHUB_API_KEY}`
    );
    return res.data.slice(0, limit);
  } catch {
    return [];
  }
}

// --- Sentiment Score (Basic) ---

export async function getSentimentScore(symbol: string): Promise<number> {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
    );
    return res.data.companyNewsScore || 0.5;
  } catch {
    return 0.5;
  }
}