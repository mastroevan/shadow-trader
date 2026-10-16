import React from 'react';

export function DisclosureBlock({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </summary>
      <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">
        {value}
      </p>
    </details>
  );
}

export function PlanBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}
