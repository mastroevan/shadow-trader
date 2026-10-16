import React from 'react';
import { ToastState } from '../../types';

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const tone =
    toast.type === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-emerald-300 bg-emerald-50 text-emerald-950';

  return (
    <div
      className={`fixed right-4 top-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-lg border p-4 shadow-xl ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{toast.title}</p>
          <p className="mt-1 text-sm font-semibold leading-6">{toast.body}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-current/20 text-sm font-bold"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
    </div>
  );
}
