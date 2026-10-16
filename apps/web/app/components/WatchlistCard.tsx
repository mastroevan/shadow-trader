import React from 'react';
import { BookmarkPlus, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { CARD_CLASS } from '../constants';
import { SavedWatchlistEntry, WatchlistStatus } from '../types';
import {
  formatCurrency,
  formatNumber,
  formatShortDate,
  parseFirstPriceLevel,
} from '../utils/formatters';
import { directionClass, isTriggeredReviewStatus } from '../utils/tradeLogic';
import { EmptyState } from './ui/EmptyState';

export function WatchlistCard({
  entries,
  loading,
  updatingStatusId,
  evaluatingGateId,
  quantityDrafts,
  onRefresh,
  onUpdateStatus,
  onEvaluateGate,
  onConfirmOpenTrade,
  onSkipConfirmation,
  onQuantityChange,
  onViewThesis,
}: {
  entries: SavedWatchlistEntry[];
  loading: boolean;
  updatingStatusId: string | null;
  evaluatingGateId?: string | null;
  quantityDrafts: Record<string, string>;
  onRefresh: () => void;
  onUpdateStatus: (entryId: string, status: WatchlistStatus) => void;
  onEvaluateGate?: (entryId: string) => void;
  onConfirmOpenTrade: (entry: SavedWatchlistEntry) => void;
  onSkipConfirmation: (entry: SavedWatchlistEntry) => void;
  onQuantityChange: (entryId: string, value: string) => void;
  onViewThesis: (entry: SavedWatchlistEntry) => void;
}) {
  const pendingEntries = entries.filter((entry) => isTriggeredReviewStatus(entry.status));
  const watchingEntries = entries.filter((entry) => !isTriggeredReviewStatus(entry.status));

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 shadow-sm dark:bg-emerald-500/10 dark:text-emerald-300">
            <BookmarkPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Watch List</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold">What setups am I monitoring?</h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {entries.length} active
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {pendingEntries.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase">Triggered Review</p>
                <h4 className="mt-1 text-xl font-bold">Gatekeeper approval and quantity</h4>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold shadow-sm">
                {pendingEntries.length} pending
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {pendingEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white">
                          {entry.symbol}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">
                          Triggered Review
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                            entry.gateStatus === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {entry.gateStatus === 'APPROVED' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6">
                        {entry.triggerReason || 'Trade setup triggered.'}
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        Entry: {formatCurrency(entry.triggerPrice ?? entry.startPrice ?? undefined)} | Stop:{' '}
                        {formatCurrency(parseFirstPriceLevel(entry.stopLossTrigger) ?? undefined)} | Target:{' '}
                        {formatCurrency(parseFirstPriceLevel(entry.takeProfitTrigger) ?? undefined)}
                      </p>
                      <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-4">
                        <span>
                          Confidence:{' '}
                          {entry.confidenceScore === null
                            ? 'N/A'
                            : `${Math.round(entry.confidenceScore * 100)}%`}
                        </span>
                        <span>R/R: {formatNumber(entry.riskRewardRatio)}</span>
                        <span>Size: {entry.positionSize ?? 0}</span>
                        <span>Risk/share: {formatCurrency(entry.riskPerShare ?? undefined)}</span>
                      </div>
                      {entry.gateReasons && entry.gateReasons.length > 0 && (
                        <ul className="mt-3 grid gap-1 text-sm font-semibold text-red-800">
                          {entry.gateReasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="grid min-w-full gap-2 sm:min-w-[360px] sm:grid-cols-[1fr_auto_auto]">
                      <label className="grid gap-1 text-xs font-bold uppercase text-amber-900">
                        Qty
                        <input
                          value={quantityDrafts[entry.id] ?? String(entry.positionSize ?? 20)}
                          onChange={(event) => onQuantityChange(entry.id, event.target.value)}
                          inputMode="decimal"
                          className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={updatingStatusId === entry.id || entry.gateStatus !== 'APPROVED'}
                        onClick={() => onConfirmOpenTrade(entry)}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                      >
                        {updatingStatusId === entry.id ? 'Opening...' : 'Confirm Open Trade'}
                      </button>
                      <button
                        type="button"
                        disabled={updatingStatusId === entry.id}
                        onClick={() => onSkipConfirmation(entry)}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 transition hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel/Skip
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && entries.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
              />
            ))}
          </div>
        ) : watchingEntries.length > 0 ? (
          watchingEntries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-lg font-bold tracking-normal text-zinc-950 dark:text-zinc-50">
                      {entry.symbol}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${directionClass(
                        entry.direction
                      )}`}
                    >
                      {entry.direction || 'NEUTRAL'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        entry.gateStatus === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : entry.gateStatus === 'REJECTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {entry.gateStatus === 'APPROVED'
                        ? 'Gate: Approved'
                        : entry.gateStatus === 'REJECTED'
                        ? 'Gate: Rejected'
                        : 'Gate: Unchecked'}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Confidence: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">
                        {entry.confidenceScore === null ? 'N/A' : `${Math.round(entry.confidenceScore * 100)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Start: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">
                        {entry.startPrice === null ? 'N/A' : formatCurrency(entry.startPrice)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Status: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{entry.status ?? 'Watching'}</dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Date: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{formatShortDate(entry.createdAt)}</dd>
                    </div>
                  </dl>

                  {/* Risk Gate Checklist Breakdown */}
                  <div className="mt-3 rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        Risk Gate Checklist
                      </span>
                      {entry.gateReasons && entry.gateReasons.length > 0 && (
                        <span className="text-red-600 dark:text-red-400">
                          {entry.gateReasons.length} issue{entry.gateReasons.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {entry.gateChecklist && entry.gateChecklist.length > 0 ? (
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {entry.gateChecklist.map((check) => (
                          <div
                            key={check.id}
                            className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
                          >
                            {check.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
                            )}
                            <span className="font-semibold">{check.label}:</span>
                            <span
                              className={
                                check.passed
                                  ? 'text-zinc-600 dark:text-zinc-400'
                                  : 'font-bold text-red-600 dark:text-red-400'
                              }
                            >
                              {check.actual}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Click &quot;Evaluate Risk Gate&quot; below to run gatekeeper checks.</span>
                      </div>
                    )}
                  </div>

                  {entry.triggerWarning && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                      {entry.triggerWarning}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onViewThesis(entry)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                >
                  View Thesis
                </button>

                {onEvaluateGate && (
                  <button
                    type="button"
                    disabled={evaluatingGateId === entry.id}
                    onClick={() => onEvaluateGate(entry.id)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                  >
                    <ShieldCheck className={`h-3.5 w-3.5 ${evaluatingGateId === entry.id ? 'animate-spin' : ''}`} />
                    {evaluatingGateId === entry.id ? 'Evaluating...' : 'Evaluate Risk Gate'}
                  </button>
                )}

                {(['Invalidated', 'Expired'] as WatchlistStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={updatingStatusId === entry.id}
                    onClick={() => onUpdateStatus(entry.id, status)}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                  >
                    {updatingStatusId === entry.id ? 'Saving...' : status}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : pendingEntries.length === 0 ? (
          <EmptyState
            title="No watch list setups yet"
            body="Run an analysis and add the best setups here before they become trades."
          />
        ) : null}
      </div>
    </section>
  );
}
