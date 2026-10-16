import React from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { CARD_CLASS, INNER_CARD_CLASS } from '../constants';
import { LedgerEntry } from '../types';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';
import { formatCountMap, getTrustLedgerInsights } from '../utils/tradeLogic';
import { DisclosureBlock } from './ui/Blocks';
import { EmptyState } from './ui/EmptyState';
import { MiniStat } from './ui/MiniStat';

export function TrustLedgerCard({
  entries,
  onClear,
  clearing,
  onDeleteEntry,
  deletingId,
}: {
  entries: LedgerEntry[];
  onClear: () => void;
  clearing: boolean;
  onDeleteEntry: (id: string) => void;
  deletingId: string | null;
}) {
  const insights = getTrustLedgerInsights(entries);

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-700 shadow-sm dark:bg-violet-500/10 dark:text-violet-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Trust Ledger</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold">Closed setup record</h3>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                {entries.length} finalized
              </span>
            </div>
          </div>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearing}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:border-red-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:border-red-700 dark:hover:bg-red-950"
          >
            <Trash2 className={`h-4 w-4 ${clearing ? 'animate-pulse' : ''}`} />
            {clearing ? 'Clearing...' : 'Clear history'}
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <MiniStat label="Wins" value={String(insights.totalWins)} />
        <MiniStat label="Losses" value={String(insights.totalLosses)} />
        <MiniStat label="Win Rate" value={`${insights.winRate.toFixed(1)}%`} />
        <MiniStat label="Total P/L" value={formatCurrency(insights.totalProfitLoss)} />
        <MiniStat label="Avg Win" value={formatCurrency(insights.averageWin)} />
        <MiniStat label="Avg Loss" value={formatCurrency(insights.averageLoss)} />
        <MiniStat label="Losses No Volume" value={String(insights.lossesMissingVolume)} />
        <MiniStat label="Losses R/R < 2" value={String(insights.lossesLowRiskReward)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <DisclosureBlock label="Losses by Trigger Type" value={formatCountMap(insights.lossCountByTriggerType)} />
        <DisclosureBlock
          label="Losses by Confidence Bucket"
          value={formatCountMap(insights.lossCountByConfidenceBucket)}
        />
      </div>

      <div className="mt-6 space-y-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.ledgerId} className={INNER_CARD_CLASS}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
                    {entry.symbol}
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    {entry.recordType}
                  </span>
                  {entry.outcome && (
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                        entry.outcome === 'Win' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {entry.outcome}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                    {formatDate(entry.updatedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.symbol} ledger entry`}
                    title="Delete entry"
                    disabled={deletingId === entry.id}
                    onClick={() => onDeleteEntry(entry.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 shadow-sm transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-700 dark:hover:text-red-300"
                  >
                    <Trash2 className={`h-3.5 w-3.5 ${deletingId === entry.id ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MiniStat label="Trace" value={entry.traceId ? entry.traceId.slice(0, 8) : 'N/A'} />
                <MiniStat label="Start" value={formatCurrency(entry.startPrice ?? undefined)} />
                <MiniStat label="Entry" value={formatCurrency(entry.entryPrice ?? undefined)} />
                <MiniStat label="Exit" value={formatCurrency(entry.exitPrice ?? undefined)} />
                <MiniStat label="P/L" value={formatCurrency(entry.profitLoss ?? undefined)} />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MiniStat label="R/R" value={formatNumber(entry.riskRewardRatio)} />
                <MiniStat
                  label="Size"
                  value={
                    entry.positionSize === null || entry.positionSize === undefined
                      ? 'N/A'
                      : String(entry.positionSize)
                  }
                />
                <MiniStat label="Stop Hit" value={entry.stopLossHit ? 'Yes' : 'No'} />
                <MiniStat label="Time" value={entry.timeInTrade ?? 'N/A'} />
                <MiniStat label="Closed" value={formatDate(entry.closedAt ?? entry.exitDate)} />
              </div>

              <div className="mt-4 grid gap-2">
                <DisclosureBlock label="Original Thesis" value={entry.thesis || 'No thesis saved.'} />
                {entry.lossReason && <DisclosureBlock label="Loss Reason" value={entry.lossReason} />}
                <DisclosureBlock label="Notes" value={entry.notes || entry.invalidationReason || 'N/A'} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No trust ledger records"
            body="Invalidated, expired, and closed setups will land here for review."
          />
        )}
      </div>
    </section>
  );
}
