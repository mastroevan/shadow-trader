export const API_BASE_URL = '/api/backend';
export const DEMO_INSTRUMENTS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'NVDA', 'TSLA', 'AAPL'];
export const LIVE_POLL_INTERVAL_MS = 20_000;
export const AUTO_WATCHLIST_CONFIDENCE = 75;
export const MANUAL_WATCHLIST_CONFIDENCE = 60;
export const CARD_CLASS =
  'rounded-lg border border-zinc-200/80 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]';
export const INNER_CARD_CLASS =
  'rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950';
export const THEME_STORAGE_KEY = 'shadow-trader-theme';
export const SHOW_DEV_RESET = process.env.NODE_ENV === 'development';
