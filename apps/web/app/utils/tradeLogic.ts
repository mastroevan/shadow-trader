import { AUTO_WATCHLIST_CONFIDENCE, MANUAL_WATCHLIST_CONFIDENCE } from '../constants';
import {
  AnalyzeResponse,
  EquityPoint,
  LedgerEntry,
  SavedWatchlistEntry,
  SignalDetail,
  TradePlan,
  TradingThesis,
  TrustLedgerInsights,
  WatchlistDecision,
  WatchlistStatus,
} from '../types';
import { formatAnalysisTimeframe, formatShortDate, titleCase } from './formatters';

export function getConfidencePct(thesis?: TradingThesis): number | null {
  return typeof thesis?.confidenceScore === 'number' ? Math.round(thesis.confidenceScore * 100) : null;
}

export function getWatchlistDecision(
  confidencePct: number | null,
  savedEntry: SavedWatchlistEntry | null
): WatchlistDecision {
  if (savedEntry && (confidencePct ?? 0) >= AUTO_WATCHLIST_CONFIDENCE) return 'auto-added';
  if (savedEntry) return 'added';
  if (confidencePct === null) return 'waiting';
  if (confidencePct >= AUTO_WATCHLIST_CONFIDENCE) return 'auto-added';
  if (confidencePct >= MANUAL_WATCHLIST_CONFIDENCE) return 'manual';
  return 'rejected';
}

export function getFeaturedSignals(signals: SignalDetail[]): SignalDetail[] {
  return signals.filter((signal) =>
    [
      'INTRADAY_MOMENTUM',
      'VWAP_POSITION',
      'EMA_ALIGNMENT',
      'RSI_14',
      'VOLUME_SPIKE',
      'RANGE_BREAKOUT',
      'SPREAD_LIQUIDITY',
      'NEWS_SENTIMENT',
    ].includes(signal.type ?? '')
  );
}

export function getStrategy(thesis?: TradingThesis): string {
  if (thesis?.strategy) return thesis.strategy;

  const setupType = thesis?.setup?.setupType;
  if (setupType && setupType !== 'NO_TRADE') {
    return `${titleCase(setupType)} setup`;
  }

  return thesis ? 'AI watchlist review' : 'N/A';
}

export function getTradingStyle(thesis?: TradingThesis): string {
  if (thesis?.tradingStyle) return thesis.tradingStyle;

  const hold = getExpectedHold(thesis).toLowerCase();
  if (hold.includes('minute') || hold.includes('hour') || hold.includes('intraday')) return 'Day Trading';
  if (hold.includes('day') || hold.includes('week')) return 'Swing';

  return thesis ? 'AI selected' : 'N/A';
}

export function getAnalysisTimeframe(thesis?: TradingThesis): string {
  const value = thesis?.analysisTimeframe;
  if (value) return formatAnalysisTimeframe(value);

  return thesis ? 'Based on 5-minute chart' : 'N/A';
}

export function getExpectedHold(thesis?: TradingThesis): string {
  return thesis?.expectedHold ?? thesis?.setup?.maxHoldTime ?? thesis?.timeHorizon ?? 'N/A';
}

export function getAnalysisReason(thesis?: TradingThesis): string {
  if (!thesis) return 'Run a setup scan to let the AI choose the analysis approach.';
  if (thesis.analysisReason) return thesis.analysisReason;

  return `AI selected ${getTradingStyle(thesis).toLowerCase()} using ${getAnalysisTimeframe(thesis).toLowerCase()} because the current setup requires ${getStrategy(thesis).toLowerCase()} context.`;
}

export function getFallbackNotice(agentFailure?: AnalyzeResponse['agentFailure']): string {
  if (agentFailure?.reason === 'TIMEOUT') {
    return 'AI analysis exceeded the agent time budget, so this run used a rule-based fallback. The agent now has a longer default budget; re-run analysis for a full AI thesis.';
  }

  if (agentFailure?.reason === 'AGENT_UNREACHABLE') {
    return 'The Python OpenAI agent is not reachable, so this run used a rule-based fallback. Start or redeploy the agent service, then re-run analysis.';
  }

  if (agentFailure?.reason === 'AGENT_CONFIG') {
    return 'The OpenAI agent appears to be missing credentials or provider configuration, so this run used a rule-based fallback. Check the agent environment variables, then re-run analysis.';
  }

  if (agentFailure?.reason === 'AGENT_QUOTA') {
    return 'OpenAI rejected the request because the configured account is out of quota or credits, so this run used a rule-based fallback. Update OpenAI billing or credentials, then re-run analysis.';
  }

  if (agentFailure?.reason === 'INVALID_AGENT_RESPONSE') {
    return 'The OpenAI agent returned a response that did not match the required thesis schema, so this run used a rule-based fallback. Re-run analysis after the agent is healthy.';
  }

  return 'The OpenAI agent did not complete successfully, so this analysis used a rule-based fallback. Re-run analysis when the agent is responsive for a full AI thesis.';
}

export function watchlistStatusClass(status?: WatchlistStatus): string {
  if (status === 'Triggered Review') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  if (status === 'Pending Confirmation') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  if (status === 'Triggered') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300';
  if (status === 'Invalidated') return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
  if (status === 'Expired') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
}

export function isTriggeredReviewStatus(status?: WatchlistStatus): boolean {
  return status === 'Triggered Review' || status === 'Pending Confirmation';
}

export function directionClass(direction?: string): string {
  const normalized = direction?.toUpperCase() ?? '';
  if (normalized.includes('BULL') || normalized.includes('LONG'))
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (normalized.includes('BEAR') || normalized.includes('SHORT'))
    return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
}

export function deriveTradeRiskFields(thesis: TradingThesis, signals: SignalDetail[]) {
  const volumeSignal = signals.find((signal) => signal.type === 'VOLUME_SPIKE');
  const volumeRatio = typeof volumeSignal?.value === 'number' ? volumeSignal.value : null;
  const trendSignals = signals
    .filter((signal) => ['INTRADAY_MOMENTUM', 'EMA_ALIGNMENT', 'VWAP_POSITION'].includes(signal.type ?? ''))
    .map((signal) => (typeof signal.value === 'number' ? Math.min(Math.abs(signal.value) / 2, 1) : 0));
  const trendStrength =
    trendSignals.length > 0
      ? Number((trendSignals.reduce((sum, value) => sum + value, 0) / trendSignals.length).toFixed(2))
      : null;

  return {
    volumeConfirmation: volumeRatio !== null ? volumeRatio >= 1.2 : false,
    trendStrength,
    marketCondition: getMarketCondition(signals),
    triggerType: getTriggerType(thesis),
  };
}

export function getMarketCondition(signals: SignalDetail[]): string {
  const momentum = signals.find((signal) => signal.type === 'INTRADAY_MOMENTUM');
  const value = typeof momentum?.value === 'number' ? momentum.value : 0;

  if (value > 0.75) return 'Bullish momentum';
  if (value < -0.75) return 'Bearish momentum';

  return 'Range-bound';
}

export function getTriggerType(thesis: TradingThesis): string {
  const setupType = thesis.setup?.setupType;
  if (setupType && setupType !== 'NO_TRADE') return setupType;

  const text = `${thesis.tradePlan?.entryTrigger ?? ''} ${thesis.setup?.entryZone ?? ''}`.toLowerCase();
  if (text.includes('breakout') || text.includes('above') || text.includes('below')) return 'BREAKOUT';
  if (text.includes('pullback')) return 'PULLBACK';
  if (text.includes('reversal')) return 'REVERSAL';

  return 'CONFIRMATION';
}

export function getTradePlan(thesis: TradingThesis, signals: SignalDetail[]): Required<TradePlan> {
  const vwapSignal = signals.find((signal) => signal.type === 'VWAP_POSITION');
  const emaSignal = signals.find((signal) => signal.type === 'EMA_ALIGNMENT');
  const momentumSignal = signals.find((signal) => signal.type === 'INTRADAY_MOMENTUM');
  const sentimentSignal = signals.find((signal) => signal.type === 'NEWS_SENTIMENT');
  const direction = thesis.direction?.toUpperCase() ?? 'NEUTRAL';
  const isBearish = direction.includes('BEAR');

  return {
    entryTrigger:
      thesis.tradePlan?.entryTrigger ??
      (isBearish
        ? 'Watch for continued downside pressure while price remains below VWAP or short-term EMAs.'
        : 'Watch for price confirmation with follow-through above VWAP or short-term EMAs.'),
    invalidation:
      thesis.tradePlan?.invalidation ??
      (isBearish
        ? 'Reassess if price recovers above VWAP and momentum flips positive.'
        : 'Reassess if price loses VWAP and intraday momentum flips negative.'),
    watchConditions:
      thesis.tradePlan?.watchConditions?.slice(0, 4) ?? [
        vwapSignal?.interpretation ?? 'VWAP position remains aligned with the thesis.',
        emaSignal?.interpretation ?? momentumSignal?.interpretation ?? 'Intraday trend confirms the directional call.',
        sentimentSignal?.interpretation ?? 'Recent headlines do not contradict the setup.',
      ],
  };
}

export function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function countBy<T>(entries: T[], getKey: (entry: T) => string): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = getKey(entry);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function confidenceBucket(confidenceScore?: number | null): string {
  if (typeof confidenceScore !== 'number') return 'Unknown';
  if (confidenceScore < 0.6) return 'below 60%';
  if (confidenceScore < 0.7) return '60-70%';
  if (confidenceScore < 0.75) return '70-75%';
  return '75%+';
}

export function formatCountMap(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'No losses recorded.';
  return entries.map(([key, value]) => `${key}: ${value}`).join('\n');
}

export function parseHoldingMinutes(entry: LedgerEntry): number | null {
  if (entry.entryDate && (entry.closedAt || entry.exitDate)) {
    const start = new Date(entry.entryDate).getTime();
    const end = new Date(entry.closedAt || entry.exitDate!).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return (end - start) / 60_000;
    }
  }

  if (entry.timeInTrade) {
    const hoursMatch = entry.timeInTrade.match(/(\d+)\s*h/);
    const minsMatch = entry.timeInTrade.match(/(\d+)\s*m/);
    const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    if (hours > 0 || mins > 0) return hours * 60 + mins;
  }

  return null;
}

export function formatHoldingDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function getTrustLedgerInsights(entries: LedgerEntry[]): TrustLedgerInsights {
  const closedTrades = entries.filter((entry) => entry.recordType === 'Closed Trade');
  const wins = closedTrades.filter((entry) => entry.outcome === 'Win');
  const losses = closedTrades.filter((entry) => entry.outcome === 'Loss');
  const winAmounts = wins.map((entry) => entry.profitLoss ?? entry.pnl ?? 0);
  const lossAmounts = losses.map((entry) => entry.profitLoss ?? entry.pnl ?? 0);
  const totalProfitLoss = closedTrades.reduce((sum, entry) => sum + (entry.profitLoss ?? entry.pnl ?? 0), 0);

  const pnlList = closedTrades.map((entry) => entry.profitLoss ?? entry.pnl ?? 0);
  const meanReturn = averageNumbers(pnlList);
  const variance =
    pnlList.length > 1
      ? pnlList.reduce((sum, val) => sum + Math.pow(val - meanReturn, 2), 0) / (pnlList.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const annualizationFactor = Math.sqrt(Math.min(closedTrades.length, 252));
  const sharpeRatio = stdDev > 0 ? Number(((meanReturn / stdDev) * annualizationFactor).toFixed(2)) : 0;

  const negativeReturns = pnlList.filter((val) => val < 0);
  const downsideVariance =
    negativeReturns.length > 0
      ? negativeReturns.reduce((sum, val) => sum + Math.pow(val, 2), 0) / negativeReturns.length
      : 0;
  const downsideStdDev = Math.sqrt(downsideVariance);
  const sortinoRatio =
    downsideStdDev > 0 ? Number(((meanReturn / downsideStdDev) * annualizationFactor).toFixed(2)) : 0;

  const grossWins = winAmounts.reduce((sum, val) => sum + val, 0);
  const grossLosses = Math.abs(lossAmounts.reduce((sum, val) => sum + val, 0));
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : (grossWins > 0 ? 99.9 : 0);

  // Chronological curve
  const sortedTrades = [...closedTrades].sort((a, b) => {
    const timeA = new Date(a.closedAt ?? a.exitDate ?? a.updatedAt ?? 0).getTime();
    const timeB = new Date(b.closedAt ?? b.exitDate ?? b.updatedAt ?? 0).getTime();
    return timeA - timeB;
  });

  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  const cumulativePnlCurve: EquityPoint[] = sortedTrades.map((entry, index) => {
    const tradePnl = entry.profitLoss ?? entry.pnl ?? 0;
    runningPnl += tradePnl;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = Math.max(0, peak - runningPnl);
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;

    return {
      tradeNumber: index + 1,
      date: formatShortDate(entry.closedAt ?? entry.exitDate ?? entry.updatedAt),
      symbol: entry.symbol,
      outcome: entry.outcome,
      tradePnl,
      cumulativePnl: runningPnl,
      drawdown,
      drawdownPercent: Number(drawdownPercent.toFixed(1)),
    };
  });

  const winDurations = wins.map(parseHoldingMinutes).filter((d): d is number => d !== null);
  const lossDurations = losses.map(parseHoldingMinutes).filter((d): d is number => d !== null);

  return {
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
    averageWin: averageNumbers(winAmounts),
    averageLoss: averageNumbers(lossAmounts),
    totalProfitLoss,
    lossCountByTriggerType: countBy(losses, (entry) => entry.triggerType ?? 'Unknown'),
    lossesMissingVolume: losses.filter((entry) => entry.volumeConfirmation !== true).length,
    lossesLowRiskReward: losses.filter((entry) => typeof entry.riskRewardRatio === 'number' && entry.riskRewardRatio < 2).length,
    lossCountByConfidenceBucket: countBy(losses, (entry) => confidenceBucket(entry.confidenceScore)),
    cumulativePnlCurve,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(1)),
    averageWinHoldingTimeMinutes: averageNumbers(winDurations),
    averageLossHoldingTimeMinutes: averageNumbers(lossDurations),
    profitFactor,
  };
}
