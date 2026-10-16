import React from 'react';
import { BookmarkPlus, CheckCircle2 } from 'lucide-react';
import { WatchlistDecision } from '../types';

export function WatchlistDecisionAction({
  decision,
  saving,
  hasThesis,
  message,
  onAddToWatchlist,
}: {
  decision: WatchlistDecision;
  saving: boolean;
  hasThesis: boolean;
  message: string;
  onAddToWatchlist: () => void;
}) {
  if (decision === 'auto-added') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
        <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">
          <CheckCircle2 className="h-4 w-4" />
          Added Automatically
        </div>
        <p className="mt-3 text-sm font-semibold leading-6">
          {message || 'Added to Watch List automatically because confidence is 75% or higher.'}
        </p>
      </div>
    );
  }

  if (decision === 'added') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
        <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">
          <CheckCircle2 className="h-4 w-4" />
          Added to Watch List
        </div>
        <p className="mt-3 text-sm font-semibold leading-6">
          {message || 'This setup is now on your Watch List.'}
        </p>
      </div>
    );
  }

  if (decision === 'manual') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="mb-3 text-sm font-semibold leading-6">
          {message || 'This setup has moderate confidence. Review before adding to your Watch List.'}
        </p>
        <button
          type="button"
          disabled={saving || !hasThesis}
          onClick={onAddToWatchlist}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          <BookmarkPlus className="h-4 w-4" />
          {saving ? 'Adding...' : 'Add to Watch List'}
        </button>
      </div>
    );
  }

  if (decision === 'rejected') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <div className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-bold text-white">
          Rejected
        </div>
        <p className="mt-3 text-sm font-semibold leading-6">
          {message || 'Rejected automatically because confidence is below 60%.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
      Run a setup scan to let the AI decide watchlist eligibility.
    </div>
  );
}
