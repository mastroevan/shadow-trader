import React from 'react';
import { SavedWatchlistEntry } from '../types';
import { formatCurrency, formatNumber, parseFirstPriceLevel } from '../utils/formatters';
import { MiniStat } from './ui/MiniStat';

export function PendingConfirmationModal({
  entry,
  quantity,
  updating,
  onQuantityChange,
  onConfirm,
  onSkip,
  onClose,
}: {
  entry: SavedWatchlistEntry | null;
  quantity: string;
  updating: boolean;
  onQuantityChange: (value: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-amber-600 dark:text-amber-300">Triggered Review</p>
            <h3 className="mt-1 text-2xl font-bold">Trade setup triggered: {entry.symbol}</h3>
            <span
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                entry.gateStatus === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              Gatekeeper: {entry.gateStatus === 'APPROVED' ? 'Approved' : 'Rejected'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white"
            aria-label="Close confirmation"
          >
            x
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Entry" value={formatCurrency(entry.triggerPrice ?? entry.startPrice ?? undefined)} />
          <MiniStat label="Stop" value={formatCurrency(parseFirstPriceLevel(entry.stopLossTrigger) ?? undefined)} />
          <MiniStat label="Target" value={formatCurrency(parseFirstPriceLevel(entry.takeProfitTrigger) ?? undefined)} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Risk/Reward" value={formatNumber(entry.riskRewardRatio)} />
          <MiniStat label="Position Size" value={String(entry.positionSize ?? 0)} />
          <MiniStat label="Max Risk" value={formatCurrency(entry.maxDollarRisk ?? undefined)} />
        </div>

        {entry.gateReasons && entry.gateReasons.length > 0 && (
          <ul className="mt-4 grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">
            {entry.gateReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        <label className="mt-5 grid gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-200">
          How many shares/contracts/coins do you want to buy?
          <input
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
            inputMode="decimal"
            className="min-h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg font-bold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
          />
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={updating || entry.gateStatus !== 'APPROVED'}
            onClick={onConfirm}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {updating ? 'Opening...' : 'Confirm Open Trade'}
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={onSkip}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-amber-500 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          >
            Cancel/Skip
          </button>
        </div>
      </div>
    </div>
  );
}
