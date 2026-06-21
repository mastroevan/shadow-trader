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
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
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

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  };
}

export default function Home() {
  const [symbol, setSymbol] = useState('NVDA');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [savedEntry, setSavedEntry] = useState<SavedWatchlistEntry | null>(null);
  const [watchlistEntries, setWatchlistEntries] = useState<SavedWatchlistEntry[]>([]);
  const [tradeEntries, setTradeEntries] = useState<TradeEntry[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [deletingWatchlistId, setDeletingWatchlistId] = useState<string | null>(null);
  const [updatingWatchlistStatusId, setUpdatingWatchlistStatusId] = useState<string | null>(null);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [resolvingOutcome, setResolvingOutcome] = useState<ThesisStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadWorkflow();
  }, []);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this watchlist entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setSavingWatchlist(false);
    }
  }

  async function handleDeleteWatchlistEntry(entryId: string) {
    setDeletingWatchlistId(entryId);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/watchlist/${entryId}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });

      if (!response.ok) {
        let message = 'Could not remove this watchlist entry.';

        try {
          const data = (await response.json()) as { message?: string; error?: string };
          message = data.message ?? data.error ?? message;
        } catch {
          // DELETE normally returns no body on success; keep the default error on parse failure.
        }

        throw new Error(message);
      }

      setWatchlistEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      setSavedEntry((entry) => entry?.id === entryId ? null : entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove this watchlist entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setDeletingWatchlistId(null);
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

  async function handleResolveThesis(status: ThesisStatus) {
    const thesisRecordId = result?.thesisRecord?.id ?? result?.thesisRecordId;
    if (!thesisRecordId || !quote?.price) return;

    setResolvingOutcome(status);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/theses/${thesisRecordId}/outcome`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({
          status,
          finalPrice: quote.price,
          notes: `${status.toLowerCase()} from the analysis workspace.`,
        }),
      });

      const data = (await response.json()) as { record?: ThesisRecord; message?: string; error?: string };

      if (!response.ok || !data.record) {
        throw new Error(data.message ?? data.error ?? 'Could not update thesis outcome.');
      }

      setResult((current) => current ? { ...current, thesisRecord: data.record } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update thesis outcome.';
      setError(message);
    } finally {
      setResolvingOutcome(null);
    }
  }

  const thesis = result?.thesis;
  const quote = result?.quote;
  const thesisRecord = result?.thesisRecord ?? null;
  const symbolLabel = thesis?.symbol ?? quote?.symbol ?? result?.meta?.symbol ?? symbol.toUpperCase();
  const priceChangePct = useMemo(() => {
    if (!quote?.price || !quote.previousClose) return null;
    return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  }, [quote]);
  const isPositive = (priceChangePct ?? 0) >= 0;
  const confidence = typeof thesis?.confidenceScore === 'number' ? thesis.confidenceScore : null;
  const confidencePct = confidence === null ? null : Math.round(confidence * 100);
  const topNews = result?.news?.filter((item) => item.headline).slice(0, 5) ?? [];
  const featuredSignals = (result?.signalDetails ?? []).filter((signal) =>
    ['PRICE_CHANGE', 'INTRADAY_RANGE', 'NEWS_SENTIMENT', 'SMA_TREND'].includes(signal.type ?? '')
  );
  const tradePlan = thesis ? getTradePlan(thesis, featuredSignals) : null;

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-8 text-zinc-950 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-emerald-700">Shadow Trader</p>
              <h1 className="mt-2 text-4xl font-bold md:text-5xl">Market thesis desk</h1>
              <p className="mt-3 max-w-2xl text-base text-zinc-600">
                Live quote, signal, headline, and AI thesis analysis for fast ticker research.
              </p>
            </div>

            <form onSubmit={handleAnalyze} className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-md">
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="NVDA"
                disabled={loading}
                className="min-h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 text-lg font-bold uppercase outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:bg-zinc-100"
              />

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
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
                className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div key={item} className="h-36 animate-pulse rounded-lg border border-zinc-200 bg-white shadow-sm" />
            ))}
          </section>
        )}

        {result?.agentStatus === 'RULE_BASED_FALLBACK' && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900 shadow-sm">
            The AI agent did not respond before the timeout, so this analysis used a rule-based fallback. Re-run analysis when the agent is responsive for a full Gemini thesis.
          </section>
        )}

        <WatchlistCard
          entries={watchlistEntries}
          loading={loadingWatchlist}
          deletingId={deletingWatchlistId}
          updatingStatusId={updatingWatchlistStatusId}
          onRefresh={() => void loadWorkflow()}
          onDelete={handleDeleteWatchlistEntry}
          onUpdateStatus={handleUpdateWatchlistStatus}
        />

        <TradeListCard
          entries={tradeEntries}
          closingTradeId={closingTradeId}
          onCloseTrade={handleCloseTrade}
        />

        <TrustLedgerList entries={ledgerEntries} />

        {result && quote && (
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
            <QuoteCard symbol={symbolLabel} quote={quote} priceChangePct={priceChangePct} isPositive={isPositive} />

            {thesis && <ThesisCard thesis={thesis} symbol={symbolLabel} confidencePct={confidencePct} />}
          </section>
        )}

        {result && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Panel title="Signals" icon={<Activity className="h-5 w-5" />}>
              <div className="grid gap-3">
                {featuredSignals.length > 0 ? (
                  featuredSignals.map((signal) => <SignalRow key={`${signal.type}-${signal.label}`} signal={signal} />)
                ) : (
                  <p className="text-sm text-zinc-500">No signal details returned.</p>
                )}
              </div>
            </Panel>

            <Panel title="News Headlines" icon={<Newspaper className="h-5 w-5" />}>
              <div className="space-y-3">
                {topNews.length > 0 ? (
                  topNews.map((item, index) => (
                    <a
                      key={`${item.headline}-${index}`}
                      href={item.url || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white"
                    >
                      <p className="text-sm font-bold leading-5 text-zinc-950">{item.headline}</p>
                      <p className="mt-2 text-xs font-semibold uppercase text-zinc-500">
                        {item.source || 'Unknown source'}
                      </p>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No recent headlines returned.</p>
                )}
              </div>
            </Panel>
          </section>
        )}

        {thesisRecord && (
          <TrustLedgerCard
            record={thesisRecord}
            resolvingOutcome={resolvingOutcome}
            onResolve={handleResolveThesis}
          />
        )}

        {thesis && tradePlan && (
          <ActionPlanCard
            plan={tradePlan}
            saving={savingWatchlist}
            savedEntry={savedEntry}
            onAddToWatchlist={handleAddToWatchlist}
          />
        )}

        {thesis && (
          <section className="grid gap-6 md:grid-cols-2">
            <FactorList title="Bullish Factors" factors={thesis.bullishFactors} tone="bullish" />
            <FactorList title="Bearish Factors" factors={thesis.bearishFactors} tone="bearish" />
          </section>
        )}

        {thesis?.riskExplanation && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
            <p className="text-sm font-bold uppercase">Risk Explanation</p>
            <p className="mt-3 leading-7">{thesis.riskExplanation}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function WatchlistCard({
  entries,
  loading,
  deletingId,
  updatingStatusId,
  onRefresh,
  onDelete,
  onUpdateStatus,
}: {
  entries: SavedWatchlistEntry[];
  loading: boolean;
  deletingId: string | null;
  updatingStatusId: string | null;
  onRefresh: () => void;
  onDelete: (entryId: string) => void;
  onUpdateStatus: (entryId: string, status: WatchlistStatus) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <BookmarkPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500">Watchlist</p>
            <h3 className="text-2xl font-bold">Saved trade setups</h3>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {loading && entries.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50" />
            ))}
          </div>
        ) : entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white">
                      {entry.symbol}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${directionClass(entry.direction)}`}>
                      {entry.direction || 'NEUTRAL'}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-zinc-600 shadow-sm">
                      {entry.suggestedAction || 'WATCH'}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${watchlistStatusClass(entry.status)}`}>
                      {entry.status ?? 'Watching'}
                    </span>
                    <span className="text-xs font-semibold uppercase text-zinc-500">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>

                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(['Triggered', 'Invalidated', 'Expired'] as WatchlistStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={updatingStatusId === entry.id}
                      onClick={() => onUpdateStatus(entry.id, status)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updatingStatusId === entry.id ? 'Saving...' : status}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={deletingId === entry.id}
                    onClick={() => onDelete(entry.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingId === entry.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MiniStat
                  label="Confidence"
                  value={entry.confidenceScore === null ? 'N/A' : `${Math.round(entry.confidenceScore * 100)}%`}
                />
                <MiniStat label="Start" value={entry.startPrice === null ? 'N/A' : formatCurrency(entry.startPrice)} />
                <MiniStat label="Horizon" value={entry.timeHorizon || '1W'} />
                <MiniStat label="Entry Trigger" value={entry.entryTrigger || 'Watch for signal confirmation.'} />
                <MiniStat label="Invalidation" value={entry.invalidation || 'Reassess if the thesis breaks.'} />
              </div>

              <div className="mt-4 grid gap-2">
                <DisclosureBlock label="Full Thesis" value={entry.thesis || 'No thesis summary saved.'} />
                <DisclosureBlock label="Watch Conditions" value={entry.watchConditions.length > 0 ? entry.watchConditions.join('\n') : 'No watch conditions saved.'} />
                <DisclosureBlock label="Trace" value={entry.traceId ?? 'N/A'} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            No saved watchlist entries yet.
          </p>
        )}
      </div>
    </section>
  );
}

function ActionPlanCard({
  plan,
  saving,
  savedEntry,
  onAddToWatchlist,
}: {
  plan: Required<TradePlan>;
  saving: boolean;
  savedEntry: SavedWatchlistEntry | null;
  onAddToWatchlist: () => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500">Agent Action Plan</p>
            <h3 className="text-2xl font-bold">Turn the thesis into a saved setup</h3>
          </div>
        </div>

        <button
          type="button"
          disabled={saving || Boolean(savedEntry)}
          onClick={onAddToWatchlist}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {savedEntry ? <CheckCircle2 className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
          {savedEntry ? 'Added to Watchlist' : saving ? 'Adding...' : 'Add to Watchlist'}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <PlanBlock label="Entry Trigger" value={plan.entryTrigger} />
        <PlanBlock label="Invalidation" value={plan.invalidation} />
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-bold uppercase text-zinc-500">Watch Conditions</p>
          <ul className="mt-3 space-y-2">
            {plan.watchConditions.map((condition, index) => (
              <li key={`${condition}-${index}`} className="text-sm font-semibold leading-6 text-zinc-800">
                {condition}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {savedEntry && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          Saved watchlist entry {savedEntry.id.slice(0, 8)} for {savedEntry.symbol}.
        </p>
      )}
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500">Trade List</p>
          <h3 className="text-2xl font-bold">Triggered active trades</h3>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white">{entry.symbol}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${watchlistStatusClass(entry.status)}`}>
                    Triggered
                  </span>
                  <span className="text-xs font-semibold uppercase text-zinc-500">
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
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            No triggered trades yet.
          </p>
        )}
      </div>
    </section>
  );
}

function TrustLedgerList({ entries }: { entries: LedgerEntry[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500">Trust Ledger</p>
          <h3 className="text-2xl font-bold">Finalized setup history</h3>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.ledgerId} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white">{entry.symbol}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 shadow-sm">
                    {entry.recordType}
                  </span>
                  {entry.outcome && (
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${entry.outcome === 'Win' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {entry.outcome}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold uppercase text-zinc-500">{formatDate(entry.updatedAt)}</span>
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
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            No finalized ledger records yet.
          </p>
        )}
      </div>
    </section>
  );
}

function TrustLedgerCard({
  record,
  resolvingOutcome,
  onResolve,
}: {
  record: ThesisRecord;
  resolvingOutcome: ThesisStatus | null;
  onResolve: (status: ThesisStatus) => void;
}) {
  const evidence = record.evidence;
  const evidenceStats = [
    { label: 'Signals', value: String(evidence?.signals?.length ?? evidence?.signalDetails?.length ?? 0) },
    { label: 'Headlines', value: String(evidence?.news?.length ?? 0) },
    { label: 'SMA', value: evidence?.technicals?.sma20 ? formatCurrency(evidence.technicals.sma20) : 'N/A' },
  ];
  const isClosed = record.status !== 'ACTIVE';
  const outcomeStatuses: ThesisStatus[] = ['TRIGGERED', 'INVALIDATED', 'EXPIRED'];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-zinc-500">Trust Ledger</p>
            <h3 className="text-2xl font-bold">Evidence-backed thesis record</h3>
          </div>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(record.status)}`}>
          {record.status}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <MiniStat label="Record" value={record.id.slice(0, 8)} />
        <MiniStat label="Generated" value={formatDate(record.generatedAt)} />
        <MiniStat label="Expires" value={formatDate(record.expiresAt)} />
        <MiniStat label="Start Price" value={formatCurrency(record.initialPrice ?? undefined)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {evidenceStats.map((item) => (
          <div key={item.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-bold uppercase text-zinc-500">{item.label}</p>
            <p className="mt-2 text-lg font-bold text-zinc-950">{item.value}</p>
          </div>
        ))}
      </div>

      {record.outcome && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          Outcome marked {record.outcome.status.toLowerCase()} at {formatDate(record.outcome.resolvedAt)}
          {record.outcome.finalPrice ? ` near ${formatCurrency(record.outcome.finalPrice)}.` : '.'}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {outcomeStatuses.map((status) => (
          <button
            key={status}
            type="button"
            disabled={Boolean(resolvingOutcome) || isClosed}
            onClick={() => onResolve(status)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resolvingOutcome === status ? 'Saving...' : `Mark ${status.toLowerCase()}`}
          </button>
        ))}
      </div>
    </section>
  );
}

function DisclosureBlock({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase text-zinc-500">{label}</summary>
      <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-zinc-800">{value}</p>
    </details>
  );
}

function PlanBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-zinc-800">{value}</p>
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500">Quote</p>
          <div className="mt-2 inline-flex rounded-full bg-zinc-950 px-3 py-1 text-sm font-bold text-white">
            {symbol}
          </div>
        </div>
        <BadgeDollarSign className="h-8 w-8 text-emerald-700" />
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

      <p className="mt-5 text-sm text-zinc-500">Source: {quote.source ?? 'Unknown'}</p>
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-zinc-500">Thesis</p>
          <h2 className="mt-2 text-3xl font-bold">{symbol}</h2>
        </div>
        <span className={`rounded-full border px-4 py-2 text-sm font-bold ${directionClass}`}>
          {direction}
        </span>
      </div>

      <p className="mt-6 text-lg leading-8 text-zinc-800">{thesis.thesis}</p>

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
        <div className="mt-2 h-3 rounded-full bg-zinc-100">
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">{icon}</div>
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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-950">
          <span className="rounded-md bg-white p-1.5 text-emerald-700 shadow-sm">{icon}</span>
          {signal.label}
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-700 shadow-sm">
          {formatSignalValue(signal)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{signal.interpretation}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-base font-bold text-zinc-950">{value}</p>
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
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
        <p className="mt-4 text-sm text-zinc-500">No factors returned.</p>
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

function statusClass(status: ThesisStatus) {
  if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700';
  if (status === 'INVALIDATED') return 'bg-red-50 text-red-700';
  if (status === 'EXPIRED') return 'bg-amber-50 text-amber-700';
  return 'bg-zinc-100 text-zinc-700';
}

function watchlistStatusClass(status?: WatchlistStatus) {
  if (status === 'Triggered') return 'bg-blue-50 text-blue-700';
  if (status === 'Invalidated') return 'bg-red-50 text-red-700';
  if (status === 'Expired') return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}

function directionClass(direction?: string) {
  const normalized = direction?.toUpperCase() ?? '';
  if (normalized.includes('BULL')) return 'bg-emerald-50 text-emerald-700';
  if (normalized.includes('BEAR')) return 'bg-red-50 text-red-700';
  return 'bg-zinc-100 text-zinc-700';
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
