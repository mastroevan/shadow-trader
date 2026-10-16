import React from 'react';
import { Activity, ClipboardList, Newspaper, Target } from 'lucide-react';
import { SavedWatchlistEntry } from '../types';
import { directionClass } from '../utils/tradeLogic';
import { PlanBlock } from './ui/Blocks';
import { MiniStat } from './ui/MiniStat';
import { Panel } from './ui/Panel';

export function WatchlistThesisModal({
  entry,
  onClose,
}: {
  entry: SavedWatchlistEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;

  const news = entry.news?.filter((item) => item.headline).slice(0, 5) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#f6f7f9] shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400">
              Why did the AI generate this thesis?
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold">{entry.symbol}</h2>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${directionClass(entry.direction)}`}>
                {entry.direction || 'NEUTRAL'}
              </span>
            </div>
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
            <Panel title="Full Thesis" icon={<ClipboardList className="h-5 w-5" />}>
              <p className="text-sm font-semibold leading-7 text-zinc-800 dark:text-zinc-200">
                {entry.thesis || 'No thesis summary saved.'}
              </p>
            </Panel>

            <div className="grid gap-5 md:grid-cols-2">
              <PlanBlock label="Entry Trigger" value={entry.entryTrigger || 'Watch for signal confirmation.'} />
              <PlanBlock label="Invalidation" value={entry.invalidation || 'Reassess if the thesis breaks.'} />
            </div>

            <Panel title="Watch Conditions" icon={<Target className="h-5 w-5" />}>
              {entry.watchConditions.length > 0 ? (
                <ul className="grid gap-3">
                  {entry.watchConditions.map((condition, index) => (
                    <li
                      key={`${condition}-${index}`}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold leading-6 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                    >
                      {condition}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No watch conditions saved.</p>
              )}
            </Panel>

            <Panel title="News" icon={<Newspaper className="h-5 w-5" />}>
              {news.length > 0 ? (
                <div className="space-y-3">
                  {news.map((item, index) => (
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
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">News context was not saved for this setup.</p>
              )}
            </Panel>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <p className="text-sm font-bold uppercase">Risk Explanation</p>
              <p className="mt-3 leading-7">
                {entry.riskExplanation || 'Risk explanation was not saved for this setup.'}
              </p>
            </section>

            <Panel title="Agent Action Plan" icon={<Activity className="h-5 w-5" />}>
              <div className="grid gap-4 md:grid-cols-3">
                <MiniStat label="Action" value={entry.suggestedAction || 'WATCH'} />
                <MiniStat label="Horizon" value={entry.timeHorizon || '1W'} />
                <MiniStat label="Trace" value={entry.traceId ? entry.traceId.slice(0, 8) : 'N/A'} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
