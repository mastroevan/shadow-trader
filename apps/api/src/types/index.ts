export interface MarketSignal {
  symbol: string;
  signalType: 'PRICE_SPIKE' | 'VOLUME_ANOMALY' | 'SENTIMENT_SHIFT' | 'NEWS_BREAK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  value: number;
  baseline: number;
  percentChange: number;
  timestamp: string;
  source: string;
}

export interface Investigation {
  symbol: string;
  signals: MarketSignal[];
  newsContext: NewsItem[];
  historicalPatterns: PatternMatch[];
  sentimentScore: number;
}

export interface NewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  relevanceScore: number;
}

export interface PatternMatch {
  description: string;
  dateRange: string;
  similarity: number;
  outcome: string;
}

export interface TradingThesis {
  symbol: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  thesis: string;
  confidenceScore: number;  // 0–1
  riskExplanation: string;
  bullishFactors: string[];
  bearishFactors: string[];
  suggestedAction: 'WATCH' | 'ALERT' | 'AVOID';
  timeHorizon: '1D' | '1W' | '1M';
  generatedAt: string;
  traceId: string;          // Arize trace ID for observability
}