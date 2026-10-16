import React from 'react';

export function FactorList({
  title,
  factors,
  tone,
}: {
  title: string;
  factors?: string[];
  tone: 'bullish' | 'bearish';
}) {
  const toneClass =
    tone === 'bullish'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-red-200 bg-red-50 text-red-800';

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-xl font-bold">{title}</h3>

      {factors && factors.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {factors.map((factor, index) => (
            <li
              key={`${factor}-${index}`}
              className={`rounded-lg border p-4 text-sm font-semibold leading-6 ${toneClass}`}
            >
              {factor}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No factors returned.</p>
      )}
    </section>
  );
}
