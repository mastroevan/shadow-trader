'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  BookmarkPlus,
  CheckCircle2,
  ClipboardList,
  Newspaper,
  Search,
  Sparkles,
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
  createdAt: string;
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
  const [error, setError] = useState('');

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
          thesis: thesis.thesis,
          entryTrigger: plan.entryTrigger,
          invalidation: plan.invalidation,
          watchConditions: plan.watchConditions,
          traceId: result?.traceId ?? thesis.traceId,
        }),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not save this watchlist entry.');
      }

      setSavedEntry(data.entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this watchlist entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setSavingWatchlist(false);
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
            <h3 className="text-2xl font-bold">Turn the thesis into a monitored setup</h3>
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
        ? 'Alert if downside pressure continues and price remains below the main trend signal.'
        : 'Alert if price confirms the thesis with follow-through above the current trend signal.'),
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
