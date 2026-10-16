import React, { ReactNode } from 'react';

export function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-5 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      {children}
    </section>
  );
}
