import React from 'react';
import { Layers3 } from 'lucide-react';
import { CARD_CLASS, DEMO_INSTRUMENTS } from '../constants';
import { MiniStat } from './ui/MiniStat';

export function InstrumentRail({
  activeSymbol,
  loading,
  onSelect,
}: {
  activeSymbol: string;
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  return (
    <aside className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <Layers3 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
        <h2 className="text-lg font-bold">Markets</h2>
      </div>

      <div className="mt-4 grid gap-2">
        {DEMO_INSTRUMENTS.map((item) => {
          const active = activeSymbol.toUpperCase() === item.toUpperCase();

          return (
            <button
              key={item}
              type="button"
              disabled={loading}
              onClick={() => onSelect(item)}
              className={`flex min-h-12 items-center justify-between rounded-lg border px-3 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-600 dark:hover:bg-zinc-900'
              }`}
            >
              <span>{item}</span>
              <span className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">
                {item.includes('/') ? 'Crypto' : 'Stock'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3">
        <MiniStat label="Watch setups" value={String(activeSymbol ? 1 : 0)} />
        <MiniStat label="Mode" value="Paper setup" />
      </div>
    </aside>
  );
}
