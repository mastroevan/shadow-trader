import React from 'react';
import { Activity, BadgeDollarSign, ClipboardList, Newspaper, Sparkles } from 'lucide-react';
import {
  AnalyzeResponse,
  NewsItem,
  Quote,
  SavedWatchlistEntry,
  SignalDetail,
  TradePlan,
  TradingThesis,
} from '../types';
import {
  getAnalysisReason,
  getAnalysisTimeframe,
  getExpectedHold,
  getFallbackNotice,
  getStrategy,
  getTradingStyle,
  getWatchlistDecision,
} from '../utils/tradeLogic';
import { PlanBlock } from './ui/Blocks';
import { FactorList } from './ui/FactorList';
import { MiniStat } from './ui/MiniStat';
import { Panel } from './ui/Panel';
import { QuoteCard } from './ui/QuoteCard';
import { SignalRow } from './ui/SignalRow';
import { ThesisCard } from './ui/ThesisCard';
import { WatchlistDecisionAction } from './WatchlistDecisionAction';

export function AnalysisDetailsModal({
  open,
  result,
  symbol,
  quote,
  thesis,
  confidencePct,
  priceChangePct,
  isPositive,
  signals,
  news,
  plan,
  saving,
  savedEntry,
  decisionMessage,
  onAddToWatchlist,
  onClose,
}: {
  open: boolean;
  result: AnalyzeResponse;
  symbol: string;
  quote?: Quote;
  thesis?: TradingThesis;
  confidencePct: number | null;
  priceChangePct: number | null;
  isPositive: boolean;
  signals: SignalDetail[];
  news: NewsItem[];
  plan: Required<TradePlan> | null;
  saving: boolean;
  savedEntry: SavedWatchlistEntry | null;
  decisionMessage: string;
  onAddToWatchlist: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const decision = getWatchlistDecision(confidencePct, savedEntry);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#f6f7f9] shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400">Analysis Details</p>
            <h2 className="mt-1 text-3xl font-bold">{symbol}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5">
            {result.agentStatus === 'RULE_BASED_FALLBACK' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
                {getFallbackNotice(result.agentFailure)}
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.25fr]">
              {quote ? (
                <QuoteCard symbol={symbol} quote={quote} priceChangePct={priceChangePct} isPositive={isPositive} />
              ) : (
                <Panel title="Quote" icon={<BadgeDollarSign className="h-5 w-5" />}>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No quote data returned.</p>
                </Panel>
              )}

              {thesis ? (
                <ThesisCard thesis={thesis} symbol={symbol} confidencePct={confidencePct} />
              ) : (
                <Panel title="Thesis" icon={<ClipboardList className="h-5 w-5" />}>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No thesis returned.</p>
                </Panel>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Signals" icon={<Activity className="h-5 w-5" />}>
                <div className="grid gap-3">
                  {signals.length > 0 ? (
                    signals.map((signal, index) => (
                      <SignalRow key={`${signal.type}-${signal.label}-${index}`} signal={signal} />
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No signal details returned.</p>
                  )}
                </div>
              </Panel>

              <Panel title="News Headlines" icon={<Newspaper className="h-5 w-5" />}>
                <div className="space-y-3">
                  {news.length > 0 ? (
                    news.map((item, index) => (
                      <a
                        key={`${item.headline}-${index}`}
                        href={item.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600 dark:hover:bg-zinc-900"
                      >
                        <p className="text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-50">{item.headline}</p>
                        <p className="mt-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                          {item.source || 'Unknown source'}
                        </p>
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No recent headlines returned.</p>
                  )}
                </div>
              </Panel>
            </div>

            {thesis && (
              <div className="grid gap-5 md:grid-cols-2">
                <FactorList title="Bullish Factors" factors={thesis.bullishFactors} tone="bullish" />
                <FactorList title="Bearish Factors" factors={thesis.bearishFactors} tone="bearish" />
              </div>
            )}

            {thesis && (
              <Panel title="AI Analysis" icon={<Sparkles className="h-5 w-5" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <MiniStat label="Strategy" value={getStrategy(thesis)} />
                  <MiniStat label="Trading Style" value={getTradingStyle(thesis)} />
                  <MiniStat label="Analysis Timeframe" value={getAnalysisTimeframe(thesis)} />
                  <MiniStat label="Expected Hold" value={getExpectedHold(thesis)} />
                </div>
                <div className="mt-4">
                  <PlanBlock label="Reason" value={getAnalysisReason(thesis)} />
                </div>
              </Panel>
            )}

            <Panel title="Agent Action Plan" icon={<ClipboardList className="h-5 w-5" />}>
              {plan ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <PlanBlock label="Entry Trigger" value={plan.entryTrigger} />
                  <PlanBlock label="Invalidation" value={plan.invalidation} />
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Watch Conditions</p>
                    <ul className="mt-3 space-y-2">
                      {plan.watchConditions.map((condition, index) => (
                        <li
                          key={`${condition}-${index}`}
                          className="text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200"
                        >
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No action plan returned.</p>
              )}
            </Panel>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <p className="text-sm font-bold uppercase">Risk Explanation</p>
              <p className="mt-3 leading-7">{thesis?.riskExplanation || 'No risk explanation returned.'}</p>
            </section>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Close
          </button>
          <WatchlistDecisionAction
            decision={decision}
            saving={saving}
            hasThesis={Boolean(thesis)}
            message={decisionMessage}
            onAddToWatchlist={onAddToWatchlist}
          />
        </div>
      </div>
    </div>
  );
}
