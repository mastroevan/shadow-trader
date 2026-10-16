import React from 'react';

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-base font-bold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}
