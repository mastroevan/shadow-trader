export type AssetClass = "stock" | "crypto";

export type MarketDataSource =
  | "finnhub"
  | "yahoo-chart-api"
  | "coinbase-exchange";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d";

export type Instrument = {
  assetClass: AssetClass;
  symbol: string;
  displaySymbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  exchange?: string;
  timeframe: Timeframe;
};

export type MarketQuote = {
  source: MarketDataSource;
  symbol: string;
  assetClass: AssetClass;
  price: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
  bid?: number | null;
  ask?: number | null;
  volume?: number | null;
  currency?: string;
  raw: unknown;
};

export type MarketCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketNewsItem = {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
};

export type TechnicalIndicators = {
  sma20: number | null;
  closeCount: number;
  source: MarketDataSource;
};

export type MarketSnapshot = {
  instrument: Instrument;
  quote: MarketQuote;
  candles: MarketCandle[];
  news: MarketNewsItem[];
  technicals: TechnicalIndicators | null;
};
