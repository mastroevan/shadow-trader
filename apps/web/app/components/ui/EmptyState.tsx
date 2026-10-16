import React from 'react';

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-6 dark:border-zinc-700 dark:bg-zinc-950/80">
      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{body}</p>
    </div>
  );
}
