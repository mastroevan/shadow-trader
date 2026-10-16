import React from 'react';
import { TradingThesis } from '../../types';
import { MiniStat } from './MiniStat';

export function ThesisCard({
  thesis,
  symbol,
  confidencePct,
}: {
  thesis: TradingThesis;
  symbol: string;
  confidencePct: number | null;
}) {
  const direction = thesis.direction ?? 'UNKNOWN';
  const directionClass = direction.toUpperCase().includes('BULL')
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : direction.toUpperCase().includes('BEAR')
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-zinc-100 text-zinc-700 border-zinc-200';

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Thesis</p>
          <h2 className="mt-2 text-3xl font-bold">{symbol}</h2>
        </div>
        <span className={`rounded-full border px-4 py-2 text-sm font-bold ${directionClass}`}>
          {direction}
        </span>
      </div>

      <p className="mt-6 text-lg leading-8 text-zinc-800 dark:text-zinc-200">{thesis.thesis}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MiniStat label="Action" value={thesis.suggestedAction ?? 'N/A'} />
        <MiniStat label="Horizon" value={thesis.timeHorizon ?? 'N/A'} />
        <MiniStat label="Trace" value={thesis.traceId ? thesis.traceId.slice(0, 8) : 'N/A'} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>Confidence</span>
          <span>{confidencePct === null ? 'N/A' : `${confidencePct}%`}</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-3 rounded-full bg-emerald-600"
            style={{ width: `${Math.max(0, Math.min(confidencePct ?? 0, 100))}%` }}
          />
        </div>
      </div>
    </section>
  );
}
