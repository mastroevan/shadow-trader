import React from 'react';
import { CARD_CLASS } from '../constants';
import { DayTradeSetup, Quote, TradePlan, TradingThesis, SavedWatchlistEntry } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  getAnalysisReason,
  getAnalysisTimeframe,
  getExpectedHold,
  getStrategy,
  getTradingStyle,
  getWatchlistDecision,
} from '../utils/tradeLogic';
import { PlanBlock } from './ui/Blocks';
import { MiniStat } from './ui/MiniStat';
import { WatchlistDecisionAction } from './WatchlistDecisionAction';

export function SetupTicket({
  symbol,
  thesis,
  setup,
  confidencePct,
  quote,
  plan,
  saving,
  savedEntry,
  decisionMessage,
  onAddToWatchlist,
  onOpenDetails,
  onOpenCompare,
}: {
  symbol: string;
  thesis?: TradingThesis;
  setup?: DayTradeSetup;
  confidencePct: number | null;
  quote?: Quote;
  plan: Required<TradePlan> | null;
  saving: boolean;
  savedEntry: SavedWatchlistEntry | null;
  decisionMessage: string;
  onAddToWatchlist: () => void;
  onOpenDetails: () => void;
  onOpenCompare?: () => void;
}) {
  const bias =
    setup?.bias ??
    (thesis?.direction?.toUpperCase().includes('BEAR')
      ? 'SHORT'
      : thesis?.direction?.toUpperCase().includes('BULL')
        ? 'LONG'
        : 'NEUTRAL');
  const decision = getWatchlistDecision(confidencePct, savedEntry);

  return (
    <aside className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Setup ticket</p>
          <h2 className="mt-1 text-2xl font-bold">{symbol}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            bias === 'LONG'
              ? 'bg-emerald-50 text-emerald-700'
              : bias === 'SHORT'
                ? 'bg-red-50 text-red-700'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {bias}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Strategy" value={getStrategy(thesis)} />
        <MiniStat label="Trading Style" value={getTradingStyle(thesis)} />
        <MiniStat label="Analysis Timeframe" value={getAnalysisTimeframe(thesis)} />
        <MiniStat label="Setup Type" value={setup?.setupType ?? 'NO_TRADE'} />
        <MiniStat label="Confidence" value={confidencePct === null ? 'N/A' : `${confidencePct}%`} />
        <MiniStat label="Price" value={formatCurrency(quote?.price)} />
        <MiniStat label="Expected Hold" value={getExpectedHold(thesis)} />
      </div>

      <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
        <p className="text-xs font-bold uppercase">AI Analysis</p>
        <p className="mt-2 text-sm font-semibold leading-6">{getAnalysisReason(thesis)}</p>
      </div>

      <div className="mt-5 grid gap-3">
        <PlanBlock
          label="Entry Zone"
          value={setup?.entryZone ?? plan?.entryTrigger ?? 'Run a setup scan to populate entry context.'}
        />
        <PlanBlock label="Stop Loss" value={setup?.stopLoss ?? plan?.invalidation ?? 'N/A'} />
        <PlanBlock label="Take Profit" value={setup?.takeProfit ?? 'N/A'} />
        <PlanBlock label="Risk / Reward" value={setup?.riskReward ?? 'N/A'} />
      </div>

      {setup?.warnings && setup.warnings.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-xs font-bold uppercase">Warnings</p>
          <ul className="mt-2 space-y-2">
            {setup.warnings.slice(0, 3).map((warning, index) => (
              <li key={`${warning}-${index}`} className="text-sm font-semibold leading-5">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        <WatchlistDecisionAction
          decision={decision}
          saving={saving}
          hasThesis={Boolean(thesis)}
          message={decisionMessage}
          onAddToWatchlist={onAddToWatchlist}
        />
        <button
          type="button"
          disabled={!thesis}
          onClick={onOpenDetails}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          Open Details
        </button>
        {onOpenCompare && (
          <button
            type="button"
            onClick={onOpenCompare}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50/60 px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            Compare AI Models
          </button>
        )}
      </div>
    </aside>
  );
}
