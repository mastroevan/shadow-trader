export type TradingThesis = {
  symbol?: string;
  direction?: string;
  thesis?: string;
  strategy?: string;
  tradingStyle?: string;
  analysisTimeframe?: string;
  expectedHold?: string;
  analysisReason?: string;
  confidenceScore?: number;
  bullishFactors?: string[];
  bearishFactors?: string[];
  riskExplanation?: string;
  suggestedAction?: string;
  timeHorizon?: string;
  traceId?: string;
  setup?: DayTradeSetup;
  tradePlan?: TradePlan;
  watchlistEntry?: {
    reason?: string;
  };
};

export type DayTradeSetup = {
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL' | string;
  setupType?: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'SCALP' | 'NO_TRADE' | string;
  entryZone?: string;
  stopLoss?: string;
  takeProfit?: string;
  riskReward?: string;
  maxHoldTime?: string;
  warnings?: string[];
};

export type TradePlan = {
  entryTrigger?: string;
  invalidation?: string;
  watchConditions?: string[];
};

export type Quote = {
  source?: string;
  symbol?: string;
  price?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
};

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type InstrumentMeta = {
  assetClass?: 'stock' | 'crypto' | string;
  symbol?: string;
  displaySymbol?: string;
  exchange?: string;
  timeframe?: string;
};

export type SignalDetail = {
  type?: string;
  label?: string;
  value?: number | string;
  unit?: 'percent' | 'price' | 'ratio' | 'score' | 'status';
  interpretation?: string;
};

export type NewsItem = {
  headline?: string;
  source?: string;
  url?: string;
};

export type ThesisStatus = 'ACTIVE' | 'TRIGGERED' | 'INVALIDATED' | 'EXPIRED';
export type WatchlistStatus = 'Watching' | 'Triggered Review' | 'Pending Confirmation' | 'Triggered' | 'Invalidated' | 'Expired';
export type AssetClass = 'stock' | 'crypto';
export type WatchlistDecision = 'auto-added' | 'added' | 'manual' | 'rejected' | 'waiting';

export type ToastState = {
  id: number;
  type: 'success' | 'warning';
  title: string;
  body: string;
};

export type ThesisOutcome = {
  status: ThesisStatus;
  resolvedAt: string;
  finalPrice: number | null;
  notes: string;
};

export type ThesisRecord = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  status: ThesisStatus;
  generatedAt: string;
  expiresAt: string;
  initialPrice: number | null;
  traceId: string;
  evidence?: {
    signals?: string[];
    signalDetails?: SignalDetail[];
    news?: NewsItem[];
    technicals?: {
      sma20?: number | null;
      closeCount?: number;
      source?: string;
    } | null;
  };
  outcome: ThesisOutcome | null;
};

export type AnalyzeResponse = {
  thesis?: TradingThesis;
  traceId?: string;
  agentStatus?: 'AI_AGENT' | 'RULE_BASED_FALLBACK';
  agentFailure?: {
    reason?: string;
    message?: string;
  };
  thesisRecord?: ThesisRecord;
  thesisRecordId?: string;
  signalDetails?: SignalDetail[];
  riskFields?: {
    volumeConfirmation?: boolean;
    trendStrength?: number | null;
    marketCondition?: string;
    triggerType?: string;
  };
  quote?: Quote;
  candles?: Candle[];
  news?: NewsItem[];
  technicals?: unknown;
  meta?: {
    symbol?: string;
    quoteSource?: string;
    candleCount?: number;
    instrument?: InstrumentMeta;
    analyzedAt?: string;
    refreshedAt?: string;
  };
  error?: string;
  message?: string;
};

export type MarketSnapshotResponse = Pick<AnalyzeResponse, 'quote' | 'candles' | 'technicals' | 'meta'> & {
  error?: string;
  message?: string;
};

export type RiskGateCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  threshold: string;
  detail?: string;
};

export type SavedWatchlistEntry = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  startPrice: number | null;
  thesis: string;
  entryTrigger: string;
  invalidation: string;
  entryZone?: string;
  stopLossTrigger?: string;
  takeProfitTrigger?: string;
  watchConditions: string[];
  riskExplanation?: string;
  news?: NewsItem[];
  traceId?: string;
  timeHorizon: string;
  status: WatchlistStatus;
  entryPrice?: number | null;
  currentPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskRewardRatio?: number | null;
  volumeConfirmation?: boolean | null;
  trendStrength?: number | null;
  marketCondition?: string;
  triggerType?: string;
  positionSize?: number | null;
  maxDollarRisk?: number | null;
  riskPerShare?: number | null;
  gateStatus?: 'APPROVED' | 'REJECTED';
  gateReasons?: string[];
  gateChecklist?: RiskGateCheckItem[];
  triggerPrice?: number | null;
  triggeredAt?: string;
  triggerReason?: string;
  triggerWarning?: string;
  triggerWarningAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeEntry = SavedWatchlistEntry & {
  status: 'Triggered';
  entryDate: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  currentProfitLoss: number | null;
  currentProfitLossPercent: number | null;
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  fees: number | null;
  slippage: number | null;
  stopLossHit?: boolean;
  stopLossHitAt?: string;
  notes: string;
};

export type LedgerEntry = SavedWatchlistEntry & {
  ledgerId: string;
  recordType: 'Invalidated Setup' | 'Expired Setup' | 'Closed Trade';
  dateInvalidated?: string;
  invalidationReason?: string;
  expirationDate?: string;
  entryDate?: string | null;
  entryPrice?: number | null;
  quantity?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  fees?: number | null;
  slippage?: number | null;
  exitDate?: string;
  exitPrice?: number | null;
  profitLoss?: number | null;
  pnl?: number | null;
  profitLossPercent?: number | null;
  outcome?: 'Win' | 'Loss';
  closedAt?: string;
  lossReason?: string;
  stopLossHit?: boolean;
  timeInTrade?: string;
  notes?: string;
};

export type EquityPoint = {
  tradeNumber: number;
  date: string;
  symbol: string;
  outcome?: 'Win' | 'Loss';
  tradePnl: number;
  cumulativePnl: number;
  drawdown: number;
  drawdownPercent: number;
};

export type TrustLedgerInsights = {
  totalWins: number;
  totalLosses: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  totalProfitLoss: number;
  lossCountByTriggerType: Record<string, number>;
  lossesMissingVolume: number;
  lossesLowRiskReward: number;
  lossCountByConfidenceBucket: Record<string, number>;
  // Advanced Portfolio Metrics
  cumulativePnlCurve: EquityPoint[];
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  averageWinHoldingTimeMinutes: number;
  averageLossHoldingTimeMinutes: number;
  profitFactor: number;
};

export type BacktestStrategy = 'BREAKOUT_MOMENTUM' | 'VWAP_PULLBACK' | 'MEAN_REVERSION';

export type BacktestTrade = {
  id: string;
  symbol: string;
  entryDate: string;
  exitDate: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  outcome: 'Win' | 'Loss';
  pnl: number;
  pnlPercent: number;
  holdingBars: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIMEOUT';
};

export type BacktestEquityPoint = {
  barIndex: number;
  date: string;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
};

export type BacktestResult = {
  symbol: string;
  strategy: BacktestStrategy;
  lookbackDays: number;
  candleCount: number;
  initialCapital: number;
  endingCapital: number;
  netProfit: number;
  netReturnPercent: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageWin: number;
  averageLoss: number;
  averageHoldingBars: number;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
};
