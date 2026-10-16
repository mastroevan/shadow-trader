import React from 'react';
import { ArrowDownRight, ArrowUpRight, BadgeDollarSign } from 'lucide-react';
import { Quote } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { MiniStat } from './MiniStat';

export function QuoteCard({
  symbol,
  quote,
  priceChangePct,
  isPositive,
}: {
  symbol: string;
  quote: Quote;
  priceChangePct: number | null;
  isPositive: boolean;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Quote</p>
          <div className="mt-2 inline-flex rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
            {symbol}
          </div>
        </div>
        <BadgeDollarSign className="h-8 w-8 text-emerald-700 dark:text-emerald-400" />
      </div>

      <p className="mt-6 text-5xl font-bold">{formatCurrency(quote.price)}</p>
      <div
        className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${
          isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}
      >
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {priceChangePct === null ? 'Change unavailable' : `${priceChangePct.toFixed(2)}%`}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat label="Open" value={formatCurrency(quote.open)} />
        <MiniStat label="High" value={formatCurrency(quote.high)} />
        <MiniStat label="Low" value={formatCurrency(quote.low)} />
      </div>

      <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
        Source: {quote.source ?? 'Unknown'}
      </p>
    </section>
  );
}
