'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  BookmarkPlus,
  CheckCircle2,
  ClipboardList,
  Moon,
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
} from 'lucide-react';

type TradingThesis = {
  symbol?: string;
  direction?: string;
  thesis?: string;
  confidenceScore?: number;
  bullishFactors?: string[];
  bearishFactors?: string[];
  riskExplanation?: string;
  suggestedAction?: string;
  timeHorizon?: string;
  traceId?: string;
  tradePlan?: TradePlan;
  watchlistEntry?: {
    reason?: string;
  };
};

type TradePlan = {
  entryTrigger?: string;
  invalidation?: string;
  watchConditions?: string[];
};

type Quote = {
  source?: string;
  symbol?: string;
  price?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
};

type SignalDetail = {
  type?: string;
  label?: string;
  value?: number | string;
  interpretation?: string;
};

type NewsItem = {
  headline?: string;
  source?: string;
  url?: string;
};

type AnalyzeResponse = {
  thesis?: TradingThesis;
  traceId?: string;
  agentStatus?: 'AI_AGENT' | 'RULE_BASED_FALLBACK';
  thesisRecord?: ThesisRecord;
  thesisRecordId?: string;
  signalDetails?: SignalDetail[];
  quote?: Quote;
  news?: NewsItem[];
  meta?: {
    symbol?: string;
    quoteSource?: string;
  };
  error?: string;
  message?: string;
};

type SavedWatchlistEntry = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  startPrice: number | null;
  thesis: string;
  entryTrigger: string;
  invalidation: string;
  watchConditions: string[];
  riskExplanation?: string;
  news?: NewsItem[];
  traceId?: string;
  timeHorizon: string;
  status: WatchlistStatus;
  createdAt: string;
  updatedAt: string;
};

type TradeEntry = SavedWatchlistEntry & {
  status: 'Triggered';
  entryDate: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  currentProfitLoss: number | null;
  currentProfitLossPercent: number | null;
  notes: string;
};

type LedgerEntry = SavedWatchlistEntry & {
  ledgerId: string;
  recordType: 'Invalidated Setup' | 'Expired Setup' | 'Closed Trade';
  dateInvalidated?: string;
  invalidationReason?: string;
  expirationDate?: string;
  entryDate?: string | null;
  entryPrice?: number | null;
  exitDate?: string;
  exitPrice?: number | null;
  profitLoss?: number | null;
  profitLossPercent?: number | null;
  outcome?: 'Win' | 'Loss';
  notes?: string;
};

type ThesisStatus = 'ACTIVE' | 'TRIGGERED' | 'INVALIDATED' | 'EXPIRED';
type WatchlistStatus = 'Watching' | 'Triggered' | 'Invalidated' | 'Expired';

type ThesisOutcome = {
  status: ThesisStatus;
  resolvedAt: string;
  finalPrice: number | null;
  notes: string;
};

type ThesisRecord = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  status: ThesisStatus;
  generatedAt: string;
  expiresAt: string;
  initialPrice: number | null;
  traceId: string;
  evidence?: {
    signals?: string[];
    signalDetails?: SignalDetail[];
    news?: NewsItem[];
    technicals?: {
      sma20?: number | null;
      closeCount?: number;
      source?: string;
    } | null;
  };
  outcome: ThesisOutcome | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_SHADOW_TRADER_API_KEY;
const DEMO_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'META', 'AMZN'];
const CARD_CLASS = 'rounded-lg border border-zinc-200/80 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]';
const INNER_CARD_CLASS = 'rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950';
const THEME_STORAGE_KEY = 'shadow-trader-theme';

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  };
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [symbol, setSymbol] = useState('NVDA');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [savedEntry, setSavedEntry] = useState<SavedWatchlistEntry | null>(null);
  const [watchlistEntries, setWatchlistEntries] = useState<SavedWatchlistEntry[]>([]);
  const [tradeEntries, setTradeEntries] = useState<TradeEntry[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [selectedWatchlistEntry, setSelectedWatchlistEntry] = useState<SavedWatchlistEntry | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [updatingWatchlistStatusId, setUpdatingWatchlistStatusId] = useState<string | null>(null);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadWorkflow();
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(storedTheme ? storedTheme === 'dark' : prefersDark);
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;

    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode, themeLoaded]);

  async function loadWorkflow() {
    setLoadingWatchlist(true);

    try {
      const [watchlistResponse, tradeResponse, ledgerResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/watchlist`, { headers: apiHeaders() }),
        fetch(`${API_BASE_URL}/api/trade-list`, { headers: apiHeaders() }),
        fetch(`${API_BASE_URL}/api/trust-ledger`, { headers: apiHeaders() }),
      ]);

      if (watchlistResponse.ok) {
        const data = (await watchlistResponse.json()) as { entries?: SavedWatchlistEntry[] };
        setWatchlistEntries(data.entries ?? []);
      }

      if (tradeResponse.ok) {
        const data = (await tradeResponse.json()) as { entries?: TradeEntry[] };
        setTradeEntries(data.entries ?? []);
      }

      if (ledgerResponse.ok) {
        const data = (await ledgerResponse.json()) as { entries?: LedgerEntry[] };
        setLedgerEntries(data.entries ?? []);
      }
    } catch {
      // The watchlist is useful when available, but analysis should still work without it.
    } finally {
      setLoadingWatchlist(false);
    }
  }

  async function analyzeTicker(nextSymbol?: string) {
    const cleanSymbol = (nextSymbol ?? symbol).trim().toUpperCase();

    if (!cleanSymbol) {
      setError('Enter a stock symbol first.');
      return;
    }

    setSymbol(cleanSymbol);
    setLoading(true);
    setSavedEntry(null);
    setError('');
    setResult(null);
    setAnalysisModalOpen(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ symbol: cleanSymbol }),
      });

      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `Request failed with status ${response.status}`);
      }

      setResult(data);
      setAnalysisModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message === 'Failed to fetch' ? 'Could not reach the analysis API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setLoading(false);
    }
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void analyzeTicker();
  }

  async function handleAddToWatchlist() {
    if (!thesis) return;

    const plan = getTradePlan(thesis, featuredSignals);

    setSavingWatchlist(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          symbol: symbolLabel,
          direction: thesis.direction,
          suggestedAction: thesis.suggestedAction,
          confidenceScore: thesis.confidenceScore,
          startPrice: quote?.price ?? result?.thesisRecord?.initialPrice ?? null,
          thesis: thesis.thesis,
          entryTrigger: plan.entryTrigger,
          invalidation: plan.invalidation,
          timeHorizon: thesis.timeHorizon,
          watchConditions: plan.watchConditions,
          riskExplanation: thesis.riskExplanation,
          news: topNews,
          traceId: result?.traceId ?? thesis.traceId,
        }),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not save this watchlist entry.');
      }

      const entry = data.entry;
      setSavedEntry(entry);
      setWatchlistEntries((entries) => [entry, ...entries.filter((currentEntry) => currentEntry.symbol !== entry.symbol)]);
      setAnalysisModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this watchlist entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setSavingWatchlist(false);
    }
  }

  async function handleUpdateWatchlistStatus(entryId: string, status: WatchlistStatus) {
    setUpdatingWatchlistStatusId(entryId);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/watchlist/${entryId}/status`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ status }),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry | TradeEntry | LedgerEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not update this watchlist status.');
      }

      setWatchlistEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      if (data.entry.status === 'Triggered') {
        setTradeEntries((entries) => [data.entry as TradeEntry, ...entries.filter((entry) => entry.id !== entryId)]);
      } else {
        setLedgerEntries((entries) => [data.entry as LedgerEntry, ...entries]);
      }
      setSavedEntry((entry) => entry?.id === entryId ? null : entry);
      setSelectedWatchlistEntry((entry) => entry?.id === entryId ? null : entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this watchlist status.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }

  async function handleCloseTrade(entryId: string, outcome: 'Win' | 'Loss') {
    setClosingTradeId(entryId);
    setError('');

    try {
      const trade = tradeEntries.find((entry) => entry.id === entryId);
      const response = await fetch(`${API_BASE_URL}/api/trade-list/${entryId}/close`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({
          outcome,
          exitPrice: trade?.currentPrice ?? trade?.entryPrice ?? null,
          notes: trade?.notes ?? '',
        }),
      });

      const data = (await response.json()) as { entry?: LedgerEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not close this trade.');
      }

      setTradeEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      setLedgerEntries((entries) => [data.entry!, ...entries]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not close this trade.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setClosingTradeId(null);
    }
  }

  const thesis = result?.thesis;
  const quote = result?.quote;
  const symbolLabel = thesis?.symbol ?? quote?.symbol ?? result?.meta?.symbol ?? symbol.toUpperCase();
  const priceChangePct = useMemo(() => {
    if (!quote?.price || !quote.previousClose) return null;
    return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  }, [quote]);
  const isPositive = (priceChangePct ?? 0) >= 0;
  const confidence = typeof thesis?.confidenceScore === 'number' ? thesis.confidenceScore : null;
  const confidencePct = confidence === null ? null : Math.round(confidence * 100);
  const allSignals = result?.signalDetails ?? [];
  const topNews = result?.news?.filter((item) => item.headline).slice(0, 5) ?? [];
  const featuredSignals = allSignals.filter((signal) =>
    ['PRICE_CHANGE', 'INTRADAY_RANGE', 'NEWS_SENTIMENT', 'SMA_TREND'].includes(signal.type ?? '')
  );
  const tradePlan = thesis ? getTradePlan(thesis, featuredSignals) : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f6f7f9_34%,#f8fafc_100%)] px-5 py-8 text-zinc-950 transition-colors dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18)_0,#111113_34%,#09090b_100%)] dark:text-zinc-50 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="relative rounded-lg border border-zinc-200/80 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)] md:p-8">
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDarkMode((enabled) => !enabled)}
            className="absolute right-4 top-4 inline-flex h-8 w-16 items-center rounded-full border border-zinc-300 bg-zinc-100 p-1 shadow-sm transition hover:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-emerald-500/20 md:right-6 md:top-6"
          >
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm transition-transform dark:bg-emerald-500 dark:text-white ${darkMode ? 'translate-x-8' : 'translate-x-0'}`}>
              {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </span>
          </button>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400">Shadow Trader</p>
              <h1 className="mt-2 text-4xl font-bold tracking-normal md:text-5xl">Market thesis desk</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                Analyze a ticker, save the setup, then manage it through the watch list, trades list, and trust ledger.
              </p>
            </div>

            <form onSubmit={handleAnalyze} className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-md">
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="NVDA"
                disabled={loading}
                className="min-h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 text-lg font-bold uppercase outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 dark:disabled:bg-zinc-800"
              />

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-zinc-700"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>

            </form>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {DEMO_TICKERS.map((ticker) => (
              <button
                key={ticker}
                type="button"
                disabled={loading}
                onClick={() => void analyzeTicker(ticker)}
                className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
              >
                {ticker}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}
        </section>

        {loading && (
          <section className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900" />
            ))}
          </section>
        )}

        <div className="grid gap-6">
          <WatchlistCard
            entries={watchlistEntries}
            loading={loadingWatchlist}
            updatingStatusId={updatingWatchlistStatusId}
            onRefresh={() => void loadWorkflow()}
            onUpdateStatus={handleUpdateWatchlistStatus}
            onViewThesis={setSelectedWatchlistEntry}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <TradeListCard
              entries={tradeEntries}
              closingTradeId={closingTradeId}
              onCloseTrade={handleCloseTrade}
            />

            <TrustLedgerCard entries={ledgerEntries} />
          </div>
        </div>
      </div>

      {result && (
        <AnalysisDetailsModal
          open={analysisModalOpen}
          result={result}
          symbol={symbolLabel}
          quote={quote}
          thesis={thesis}
          confidencePct={confidencePct}
          priceChangePct={priceChangePct}
          isPositive={isPositive}
          signals={allSignals}
          news={topNews}
          plan={tradePlan}
          saving={savingWatchlist}
          savedEntry={savedEntry}
          onAddToWatchlist={handleAddToWatchlist}
          onClose={() => setAnalysisModalOpen(false)}
        />
      )}

      <WatchlistThesisModal
        entry={selectedWatchlistEntry}
        onClose={() => setSelectedWatchlistEntry(null)}
      />
    </main>
  );
}

function AnalysisDetailsModal({
  open,
  result,
  symbol,
  quote,
  thesis,
  confidencePct,
  priceChangePct,
  isPositive,
  signals,
  news,
  plan,
  saving,
  savedEntry,
  onAddToWatchlist,
  onClose,
}: {
  open: boolean;
  result: AnalyzeResponse;
  symbol: string;
  quote?: Quote;
  thesis?: TradingThesis;
  confidencePct: number | null;
  priceChangePct: number | null;
  isPositive: boolean;
  signals: SignalDetail[];
  news: NewsItem[];
  plan: Required<TradePlan> | null;
  saving: boolean;
  savedEntry: SavedWatchlistEntry | null;
  onAddToWatchlist: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#f6f7f9] shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400">Analysis Details</p>
            <h2 className="mt-1 text-3xl font-bold">{symbol}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5">
            {result.agentStatus === 'RULE_BASED_FALLBACK' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
                The AI agent did not respond before the timeout, so this analysis used a rule-based fallback. Re-run analysis when the agent is responsive for a full Gemini thesis.
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.25fr]">
              {quote ? (
                <QuoteCard symbol={symbol} quote={quote} priceChangePct={priceChangePct} isPositive={isPositive} />
              ) : (
                <Panel title="Quote" icon={<BadgeDollarSign className="h-5 w-5" />}>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No quote data returned.</p>
                </Panel>
              )}

              {thesis ? (
                <ThesisCard thesis={thesis} symbol={symbol} confidencePct={confidencePct} />
              ) : (
                <Panel title="Thesis" icon={<ClipboardList className="h-5 w-5" />}>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No thesis returned.</p>
                </Panel>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Signals" icon={<Activity className="h-5 w-5" />}>
                <div className="grid gap-3">
                  {signals.length > 0 ? (
                    signals.map((signal, index) => <SignalRow key={`${signal.type}-${signal.label}-${index}`} signal={signal} />)
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No signal details returned.</p>
                  )}
                </div>
              </Panel>

              <Panel title="News Headlines" icon={<Newspaper className="h-5 w-5" />}>
                <div className="space-y-3">
                  {news.length > 0 ? (
                    news.map((item, index) => (
                      <a
                        key={`${item.headline}-${index}`}
                        href={item.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600 dark:hover:bg-zinc-900"
                      >
                        <p className="text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-50">{item.headline}</p>
                        <p className="mt-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                          {item.source || 'Unknown source'}
                        </p>
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No recent headlines returned.</p>
                  )}
                </div>
              </Panel>
            </div>

            {thesis && (
              <div className="grid gap-5 md:grid-cols-2">
                <FactorList title="Bullish Factors" factors={thesis.bullishFactors} tone="bullish" />
                <FactorList title="Bearish Factors" factors={thesis.bearishFactors} tone="bearish" />
              </div>
            )}

            <Panel title="Agent Action Plan" icon={<ClipboardList className="h-5 w-5" />}>
              {plan ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <PlanBlock label="Entry Trigger" value={plan.entryTrigger} />
                  <PlanBlock label="Invalidation" value={plan.invalidation} />
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Watch Conditions</p>
                    <ul className="mt-3 space-y-2">
                      {plan.watchConditions.map((condition, index) => (
                        <li key={`${condition}-${index}`} className="text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No action plan returned.</p>
              )}
            </Panel>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <p className="text-sm font-bold uppercase">Risk Explanation</p>
              <p className="mt-3 leading-7">{thesis?.riskExplanation || 'No risk explanation returned.'}</p>
            </section>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || Boolean(savedEntry) || !thesis}
            onClick={onAddToWatchlist}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {savedEntry ? <CheckCircle2 className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
            {savedEntry ? 'Added to Watchlist' : saving ? 'Adding...' : 'Add to Watchlist'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WatchlistThesisModal({
  entry,
  onClose,
}: {
  entry: SavedWatchlistEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;

  const news = entry.news?.filter((item) => item.headline).slice(0, 5) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#f6f7f9] shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex flex-col gap-4 border-b border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400">Why did the AI generate this thesis?</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold">{entry.symbol}</h2>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${directionClass(entry.direction)}`}>
                {entry.direction || 'NEUTRAL'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5">
            <Panel title="Full Thesis" icon={<ClipboardList className="h-5 w-5" />}>
              <p className="text-sm font-semibold leading-7 text-zinc-800 dark:text-zinc-200">
                {entry.thesis || 'No thesis summary saved.'}
              </p>
            </Panel>

            <div className="grid gap-5 md:grid-cols-2">
              <PlanBlock label="Entry Trigger" value={entry.entryTrigger || 'Watch for signal confirmation.'} />
              <PlanBlock label="Invalidation" value={entry.invalidation || 'Reassess if the thesis breaks.'} />
            </div>

            <Panel title="Watch Conditions" icon={<Target className="h-5 w-5" />}>
              {entry.watchConditions.length > 0 ? (
                <ul className="grid gap-3">
                  {entry.watchConditions.map((condition, index) => (
                    <li key={`${condition}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold leading-6 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {condition}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No watch conditions saved.</p>
              )}
            </Panel>

            <Panel title="News" icon={<Newspaper className="h-5 w-5" />}>
              {news.length > 0 ? (
                <div className="space-y-3">
                  {news.map((item, index) => (
                    <a
                      key={`${item.headline}-${index}`}
                      href={item.url || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600 dark:hover:bg-zinc-900"
                    >
                      <p className="text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-50">{item.headline}</p>
                      <p className="mt-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                        {item.source || 'Unknown source'}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">News context was not saved for this setup.</p>
              )}
            </Panel>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <p className="text-sm font-bold uppercase">Risk Explanation</p>
              <p className="mt-3 leading-7">{entry.riskExplanation || 'Risk explanation was not saved for this setup.'}</p>
            </section>

            <Panel title="Agent Action Plan" icon={<Activity className="h-5 w-5" />}>
              <div className="grid gap-4 md:grid-cols-3">
                <MiniStat label="Action" value={entry.suggestedAction || 'WATCH'} />
                <MiniStat label="Horizon" value={entry.timeHorizon || '1W'} />
                <MiniStat label="Trace" value={entry.traceId ? entry.traceId.slice(0, 8) : 'N/A'} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchlistCard({
  entries,
  loading,
  updatingStatusId,
  onRefresh,
  onUpdateStatus,
  onViewThesis,
}: {
  entries: SavedWatchlistEntry[];
  loading: boolean;
  updatingStatusId: string | null;
  onRefresh: () => void;
  onUpdateStatus: (entryId: string, status: WatchlistStatus) => void;
  onViewThesis: (entry: SavedWatchlistEntry) => void;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 shadow-sm dark:bg-emerald-500/10 dark:text-emerald-300">
            <BookmarkPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Watch List</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold">What setups am I monitoring?</h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {entries.length} active
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {loading && entries.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950" />
            ))}
          </div>
        ) : entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-lg font-bold tracking-normal text-zinc-950 dark:text-zinc-50">{entry.symbol}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${directionClass(entry.direction)}`}>
                      {entry.direction || 'NEUTRAL'}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Confidence: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{entry.confidenceScore === null ? 'N/A' : `${Math.round(entry.confidenceScore * 100)}%`}</dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Start: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{entry.startPrice === null ? 'N/A' : formatCurrency(entry.startPrice)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Status: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{entry.status ?? 'Watching'}</dd>
                    </div>
                    <div>
                      <dt className="inline text-zinc-500 dark:text-zinc-400">Date: </dt>
                      <dd className="inline text-zinc-950 dark:text-zinc-50">{formatShortDate(entry.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onViewThesis(entry)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                >
                  View Thesis
                </button>

                {(['Triggered', 'Invalidated', 'Expired'] as WatchlistStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={updatingStatusId === entry.id}
                    onClick={() => onUpdateStatus(entry.id, status)}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                  >
                    {updatingStatusId === entry.id ? 'Saving...' : status}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No watch list setups yet" body="Run an analysis and add the best setups here before they become trades." />
        )}
      </div>
    </section>
  );
}

function TradeListCard({
  entries,
  closingTradeId,
  onCloseTrade,
}: {
  entries: TradeEntry[];
  closingTradeId: string | null;
  onCloseTrade: (entryId: string, outcome: 'Win' | 'Loss') => void;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Trades List</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold">Triggered active trades</h3>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {entries.length} open
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className={INNER_CARD_CLASS}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">{entry.symbol}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${watchlistStatusClass(entry.status)}`}>
                    Triggered
                  </span>
                  <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                    {formatDate(entry.entryDate ?? entry.updatedAt)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['Win', 'Loss'] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      disabled={closingTradeId === entry.id}
                      onClick={() => onCloseTrade(entry.id, outcome)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                    >
                      {closingTradeId === entry.id ? 'Closing...' : `Closed ${outcome}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-6">
                <MiniStat label="Entry Date" value={formatDate(entry.entryDate ?? undefined)} />
                <MiniStat label="Entry Price" value={formatCurrency(entry.entryPrice ?? undefined)} />
                <MiniStat label="Current Price" value={formatCurrency(entry.currentPrice ?? undefined)} />
                <MiniStat label="P/L $" value={formatCurrency(entry.currentProfitLoss ?? undefined)} />
                <MiniStat label="P/L %" value={formatPercent(entry.currentProfitLossPercent)} />
                <MiniStat label="Notes" value={entry.notes || 'N/A'} />
              </div>

              <div className="mt-4 grid gap-2">
                <DisclosureBlock label="Original Thesis" value={entry.thesis || 'No thesis saved.'} />
                <DisclosureBlock label="Entry Trigger" value={entry.entryTrigger || 'N/A'} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No active trades" body="Triggered watch list setups will appear here with entry and P/L details." />
        )}
      </div>
    </section>
  );
}

function TrustLedgerCard({ entries }: { entries: LedgerEntry[] }) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-violet-50 p-2 text-violet-700 shadow-sm dark:bg-violet-500/10 dark:text-violet-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Trust Ledger</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold">Closed setup record</h3>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              {entries.length} finalized
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.ledgerId} className={INNER_CARD_CLASS}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">{entry.symbol}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    {entry.recordType}
                  </span>
                  {entry.outcome && (
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${entry.outcome === 'Win' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {entry.outcome}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">{formatDate(entry.updatedAt)}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MiniStat label="Trace" value={entry.traceId ? entry.traceId.slice(0, 8) : 'N/A'} />
                <MiniStat label="Start" value={formatCurrency(entry.startPrice ?? undefined)} />
                <MiniStat label="Entry" value={formatCurrency(entry.entryPrice ?? undefined)} />
                <MiniStat label="Exit" value={formatCurrency(entry.exitPrice ?? undefined)} />
                <MiniStat label="P/L" value={formatCurrency(entry.profitLoss ?? undefined)} />
              </div>

              <div className="mt-4 grid gap-2">
                <DisclosureBlock label="Original Thesis" value={entry.thesis || 'No thesis saved.'} />
                <DisclosureBlock label="Notes" value={entry.notes || entry.invalidationReason || 'N/A'} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No trust ledger records" body="Invalidated, expired, and closed setups will land here for review." />
        )}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-6 dark:border-zinc-700 dark:bg-zinc-950/80">
      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{body}</p>
    </div>
  );
}

function DisclosureBlock({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</summary>
      <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">{value}</p>
    </details>
  );
}

function PlanBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}

function QuoteCard({
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
      <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {priceChangePct === null ? 'Change unavailable' : `${priceChangePct.toFixed(2)}%`}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat label="Open" value={formatCurrency(quote.open)} />
        <MiniStat label="High" value={formatCurrency(quote.high)} />
        <MiniStat label="Low" value={formatCurrency(quote.low)} />
      </div>

      <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">Source: {quote.source ?? 'Unknown'}</p>
    </section>
  );
}

function ThesisCard({
  thesis,
  symbol,
  confidencePct,
}: {
  thesis: TradingThesis;
  symbol: string;
  confidencePct: number | null;
}) {
  const direction = thesis.direction ?? 'UNKNOWN';
  const directionClass = direction.toUpperCase().includes('BULL')
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : direction.toUpperCase().includes('BEAR')
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-zinc-100 text-zinc-700 border-zinc-200';

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">Thesis</p>
          <h2 className="mt-2 text-3xl font-bold">{symbol}</h2>
        </div>
        <span className={`rounded-full border px-4 py-2 text-sm font-bold ${directionClass}`}>
          {direction}
        </span>
      </div>

      <p className="mt-6 text-lg leading-8 text-zinc-800 dark:text-zinc-200">{thesis.thesis}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MiniStat label="Action" value={thesis.suggestedAction ?? 'N/A'} />
        <MiniStat label="Horizon" value={thesis.timeHorizon ?? 'N/A'} />
        <MiniStat label="Trace" value={thesis.traceId ? thesis.traceId.slice(0, 8) : 'N/A'} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>Confidence</span>
          <span>{confidencePct === null ? 'N/A' : `${confidencePct}%`}</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-3 rounded-full bg-emerald-600"
            style={{ width: `${Math.max(0, Math.min(confidencePct ?? 0, 100))}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-5 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{icon}</div>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SignalRow({ signal }: { signal: SignalDetail }) {
  const isSma = signal.type === 'SMA_TREND';
  const icon = isSma ? <TrendingUp className="h-4 w-4" /> : signal.type === 'NEWS_SENTIMENT' ? <Sparkles className="h-4 w-4" /> : <Target className="h-4 w-4" />;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-950 dark:text-zinc-100">
          <span className="rounded-md bg-white p-1.5 text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-300">{icon}</span>
          {signal.label}
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
          {formatSignalValue(signal)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{signal.interpretation}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-base font-bold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function FactorList({
  title,
  factors,
  tone,
}: {
  title: string;
  factors?: string[];
  tone: 'bullish' | 'bearish';
}) {
  const toneClass = tone === 'bullish' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800';

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-xl font-bold">{title}</h3>

      {factors && factors.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {factors.map((factor, index) => (
            <li key={`${factor}-${index}`} className={`rounded-lg border p-4 text-sm font-semibold leading-6 ${toneClass}`}>
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

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(value?: string) {
  if (!value) return 'N/A';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortDate(value?: string) {
  if (!value) return 'N/A';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function watchlistStatusClass(status?: WatchlistStatus) {
  if (status === 'Triggered') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300';
  if (status === 'Invalidated') return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
  if (status === 'Expired') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
}

function directionClass(direction?: string) {
  const normalized = direction?.toUpperCase() ?? '';
  if (normalized.includes('BULL')) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (normalized.includes('BEAR')) return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
}

function formatSignalValue(signal: SignalDetail) {
  if (typeof signal.value === 'number') {
    return signal.type === 'NEWS_SENTIMENT' ? String(signal.value) : `${signal.value.toFixed(2)}%`;
  }

  return signal.value ?? 'N/A';
}

function getTradePlan(thesis: TradingThesis, signals: SignalDetail[]): Required<TradePlan> {
  const smaSignal = signals.find((signal) => signal.type === 'SMA_TREND');
  const priceSignal = signals.find((signal) => signal.type === 'PRICE_CHANGE');
  const sentimentSignal = signals.find((signal) => signal.type === 'NEWS_SENTIMENT');
  const direction = thesis.direction?.toUpperCase() ?? 'NEUTRAL';
  const isBearish = direction.includes('BEAR');

  return {
    entryTrigger:
      thesis.tradePlan?.entryTrigger ??
      (isBearish
        ? 'Watch for continued downside pressure while price remains below the main trend signal.'
        : 'Watch for price confirmation with follow-through above the current trend signal.'),
    invalidation:
      thesis.tradePlan?.invalidation ??
      (isBearish
        ? 'Reassess if price recovers above the 20-day SMA or headlines turn materially positive.'
        : 'Reassess if price loses the 20-day SMA or the news/sentiment setup turns negative.'),
    watchConditions:
      thesis.tradePlan?.watchConditions?.slice(0, 4) ??
      [
        smaSignal?.interpretation ?? '20-day SMA trend remains aligned with the thesis.',
        priceSignal?.interpretation ?? 'Price action confirms the directional call.',
        sentimentSignal?.interpretation ?? 'Recent headlines do not contradict the setup.',
      ],
  };
}
