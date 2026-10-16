import React from 'react';
import { TrendingUp } from 'lucide-react';
import { CARD_CLASS, INNER_CARD_CLASS } from '../constants';
import { TradeEntry } from '../types';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../utils/formatters';
import { watchlistStatusClass } from '../utils/tradeLogic';
import { DisclosureBlock } from './ui/Blocks';
import { EmptyState } from './ui/EmptyState';
import { MiniStat } from './ui/MiniStat';

export function TradeListCard({
  entries,
  closingTradeId,
  updatingPaperTradeId,
  markPriceDrafts,
  onMarkPriceChange,
  onUpdatePaperTrade,
  onCloseTrade,
}: {
  entries: TradeEntry[];
  closingTradeId: string | null;
  updatingPaperTradeId: string | null;
  markPriceDrafts: Record<string, string>;
  onMarkPriceChange: (entryId: string, value: string) => void;
  onUpdatePaperTrade: (entryId: string) => void;
  onCloseTrade: (entryId: string, outcome: 'Win' | 'Loss') => void;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Trades List</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold">Triggered active trades</h3>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {entries.length} open
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className={INNER_CARD_CLASS}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
                    {entry.symbol}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${watchlistStatusClass(entry.status)}`}>
                    Triggered
                  </span>
                  <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                    {formatDate(entry.entryDate ?? entry.updatedAt)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['Win', 'Loss'] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      disabled={closingTradeId === entry.id}
                      onClick={() => onCloseTrade(entry.id, outcome)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                    >
                      {closingTradeId === entry.id ? 'Closing...' : `Closed ${outcome}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-6">
                <MiniStat label="Entry Date" value={formatDate(entry.entryDate ?? undefined)} />
                <MiniStat label="Entry Price" value={formatCurrency(entry.entryPrice ?? undefined)} />
                <MiniStat label="Current Price" value={formatCurrency(entry.currentPrice ?? undefined)} />
                <MiniStat label="P/L $" value={formatCurrency(entry.currentProfitLoss ?? undefined)} />
                <MiniStat label="P/L %" value={formatPercent(entry.currentProfitLossPercent)} />
                <MiniStat label="Qty" value={entry.quantity === null ? 'N/A' : String(entry.quantity)} />
              </div>

              {entry.stopLossHit && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">
                  Stop loss hit. Review this trade for closing.
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={markPriceDrafts[entry.id] ?? ''}
                  onChange={(event) => onMarkPriceChange(entry.id, event.target.value)}
                  placeholder={entry.currentPrice ? String(entry.currentPrice) : 'Mark price'}
                  inputMode="decimal"
                  className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  disabled={updatingPaperTradeId === entry.id}
                  onClick={() => onUpdatePaperTrade(entry.id)}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                >
                  {updatingPaperTradeId === entry.id ? 'Marking...' : 'Update Mark'}
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MiniStat label="Stop" value={formatCurrency(entry.stopLoss ?? undefined)} />
                <MiniStat label="Target" value={formatCurrency(entry.takeProfit ?? undefined)} />
                <MiniStat label="Risk/Reward" value={formatNumber(entry.riskRewardRatio)} />
                <MiniStat label="Max Risk" value={formatCurrency(entry.maxDollarRisk ?? undefined)} />
              </div>

              <div className="mt-4 grid gap-2">
                <DisclosureBlock label="Original Thesis" value={entry.thesis || 'No thesis saved.'} />
                <DisclosureBlock label="Entry Trigger" value={entry.entryTrigger || 'N/A'} />
                <DisclosureBlock label="Notes" value={entry.notes || 'N/A'} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No active trades"
            body="Triggered watch list setups will appear here with entry and P/L details."
          />
        )}
      </div>
    </section>
  );
}
