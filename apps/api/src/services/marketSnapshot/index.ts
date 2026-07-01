import {
  getFinnhubCompanyNews,
  getFinnhubQuote,
  getTechnicalIndicators,
  getYahooIntradayCandles,
} from "../finnhub";
import { getCryptoCandles, getCryptoNews, getCryptoQuote, getCryptoTechnicalIndicators } from "./crypto";
import type { Instrument, MarketSnapshot } from "../../types/market";

export async function getMarketSnapshot(instrument: Instrument): Promise<MarketSnapshot> {
  if (instrument.assetClass === "crypto") {
    const [quote, candles, news, technicals] = await Promise.all([
      getCryptoQuote(instrument),
      getCryptoCandles(instrument),
      getCryptoNews(instrument),
      getCryptoTechnicalIndicators(instrument),
    ]);

    return {
      instrument,
      quote,
      candles,
      news,
      technicals,
    };
  }

  const [quote, candles, news, technicals] = await Promise.all([
    getFinnhubQuote(instrument.symbol),
    getYahooIntradayCandles(instrument.symbol, instrument.timeframe),
    getFinnhubCompanyNews(instrument.symbol).catch((error) => {
      console.warn(`Company news failed for ${instrument.symbol}; continuing without headlines:`, error);

      return [];
    }),
    getTechnicalIndicators(instrument.symbol),
  ]);

  return {
    instrument,
    quote,
    candles,
    news,
    technicals,
  };
}

export function isValidMarketQuote(
  quote: MarketSnapshot["quote"] | null | undefined
): quote is MarketSnapshot["quote"] {
  return Boolean(
    quote &&
      quote.price > 0 &&
      quote.previousClose > 0 &&
      quote.timestamp > 0
  );
}
