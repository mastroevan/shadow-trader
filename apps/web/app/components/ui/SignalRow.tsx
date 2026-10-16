import React from 'react';
import { Sparkles, Target, TrendingUp } from 'lucide-react';
import { SignalDetail } from '../../types';
import { formatSignalValue } from '../../utils/formatters';

export function SignalRow({ signal }: { signal: SignalDetail }) {
  const isTrend =
    signal.type === 'VWAP_POSITION' ||
    signal.type === 'EMA_ALIGNMENT' ||
    signal.type === 'INTRADAY_MOMENTUM';
  const icon = isTrend ? (
    <TrendingUp className="h-4 w-4" />
  ) : signal.type === 'NEWS_SENTIMENT' ? (
    <Sparkles className="h-4 w-4" />
  ) : (
    <Target className="h-4 w-4" />
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-950 dark:text-zinc-100">
          <span className="rounded-md bg-white p-1.5 text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-300">
            {icon}
          </span>
          {signal.label}
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
          {formatSignalValue(signal)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {signal.interpretation}
      </p>
    </div>
  );
}
