'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Activity,
  BarChart2,
  DatabaseZap,
  LogOut,
  Moon,
  Search,
  Sun,
  Radio,
} from 'lucide-react';
import {
  AnalyzeResponse,
  AssetClass,
  SavedWatchlistEntry,
  WatchlistStatus,
} from './types';
import {
  API_BASE_URL,
  AUTO_WATCHLIST_CONFIDENCE,
  CARD_CLASS,
  MANUAL_WATCHLIST_CONFIDENCE,
  SHOW_DEV_RESET,
} from './constants';
import {
  deriveTradeRiskFields,
  getConfidencePct,
  getFeaturedSignals,
  getTradePlan,
} from './utils/tradeLogic';
import { EmptyState } from './components/ui/EmptyState';
import { SignalRow } from './components/ui/SignalRow';
import { Toast } from './components/ui/Toast';
import { InstrumentRail } from './components/InstrumentRail';
import { DeskChartPanel } from './components/DeskChartPanel';
import { SetupTicket } from './components/SetupTicket';
import { AnalysisDetailsModal } from './components/AnalysisDetailsModal';
import { WatchlistThesisModal } from './components/WatchlistThesisModal';
import { WatchlistCard } from './components/WatchlistCard';
import { TradeListCard } from './components/TradeListCard';
import { PendingConfirmationModal } from './components/PendingConfirmationModal';
import { TrustLedgerCard } from './components/TrustLedgerCard';
import { BacktestModal } from './components/BacktestModal';
import { useTheme } from './hooks/useTheme';
import { useMarketSnapshot } from './hooks/useMarketSnapshot';
import { useWatchlist } from './hooks/useWatchlist';

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

function redirectToLogin() {
  const callbackUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `/login?callbackUrl=${callbackUrl}`;
}

async function apiFetch(input: string, init?: RequestInit) {
  const response = await fetch(input, init);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Sign in required.');
  }

  return response;
}

export default function Home() {
  const { darkMode, setDarkMode } = useTheme();
  const [symbol, setSymbol] = useState('BTC/USD');
  const [assetClass, setAssetClass] = useState<AssetClass>('crypto');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [backtestModalOpen, setBacktestModalOpen] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [savedEntry, setSavedEntry] = useState<SavedWatchlistEntry | null>(null);
  const [selectedWatchlistEntry, setSelectedWatchlistEntry] = useState<SavedWatchlistEntry | null>(null);
  const [resettingDemoData, setResettingDemoData] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [watchlistDecisionMessage, setWatchlistDecisionMessage] = useState('');
  const [error, setError] = useState('');

  const {
    watchlistEntries,
    tradeEntries,
    ledgerEntries,
    loadingWatchlist,
    updatingWatchlistStatusId,
    evaluatingGateId,
    clearingLedger,
    deletingLedgerId,
    closingTradeId,
    updatingPaperTradeId,
    quantityDrafts,
    markPriceDrafts,
    pendingConfirmationEntry,
    toast,
    setToast,
    setWatchlistEntries,
    setTradeEntries,
    setLedgerEntries,
    setQuantityDrafts,
    setMarkPriceDrafts,
    setPendingConfirmationEntry,
    loadWorkflow,
    handleEvaluateRiskGate,
    handleUpdateWatchlistStatus,
    handleConfirmOpenTrade,
    handleSkipPendingConfirmation,
    handleCloseTrade,
    handleUpdatePaperTrade,
    handleDeleteLedgerEntry,
    handleClearTrustLedger,
  } = useWatchlist({ onError: setError });

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  // Real-time market streaming via SSE with fallback polling
  const { lastLiveRefresh, livePolling, isStreaming, refreshMarketSnapshot } = useMarketSnapshot({
    symbol: result?.meta?.symbol ?? (result?.quote ? symbol : undefined),
    instrument: result?.meta?.instrument,
    enabled: Boolean(result?.quote && !loading),
    onSnapshot: (snapshotData) => {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              quote: snapshotData.quote,
              candles: snapshotData.candles,
              technicals: snapshotData.technicals,
              meta: {
                ...prev.meta,
                ...snapshotData.meta,
              },
            }
          : null
      );
    },
  });

  async function handleResetDemoData() {
    const confirmed = window.confirm('Clear all local development database rows?');
    if (!confirmed) return;

    setResettingDemoData(true);
    setResetMessage('');
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/dev/reset-demo-data`, {
        method: 'POST',
        headers: apiHeaders(),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        deleted?: {
          tradeLifecycleEntries?: number;
          thesisRecords?: number;
        };
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? data.error ?? 'Could not reset development data.');
      }

      setWatchlistEntries([]);
      setTradeEntries([]);
      setLedgerEntries([]);
      setSavedEntry(null);
      setSelectedWatchlistEntry(null);
      setPendingConfirmationEntry(null);
      setResult(null);
      setAnalysisModalOpen(false);
      setMarkPriceDrafts({});
      setQuantityDrafts({});

      const deletedTotal = (data.deleted?.tradeLifecycleEntries ?? 0) + (data.deleted?.thesisRecords ?? 0);
      setResetMessage(`Development data reset. Deleted ${deletedTotal} row${deletedTotal === 1 ? '' : 's'}.`);
      void loadWorkflow();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reset development data.';
      setError(message === 'Failed to fetch' ? 'Could not reach the reset API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setResettingDemoData(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await signOut({ callbackUrl: '/login' });
  }

  async function analyzeTicker(nextSymbol?: string, nextAssetClass = assetClass) {
    const cleanSymbol = (nextSymbol ?? symbol).trim().toUpperCase();

    if (!cleanSymbol) {
      setError('Enter a symbol first.');
      return;
    }

    setSymbol(cleanSymbol);
    setLoading(true);
    setSavedEntry(null);
    setWatchlistDecisionMessage('');
    setError('');
    setResult(null);
    setAnalysisModalOpen(false);

    try {
      const response = await apiFetch(`${API_BASE_URL}/setups/analyze`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ symbol: cleanSymbol, assetClass: nextAssetClass }),
      });

      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `Request failed with status ${response.status}`);
      }

      setResult(data);
      setAnalysisModalOpen(true);

      const nextConfidencePct = getConfidencePct(data.thesis);
      if (nextConfidencePct !== null && nextConfidencePct >= AUTO_WATCHLIST_CONFIDENCE) {
        await saveWatchlistForAnalysis(data, 'auto');
      } else if (nextConfidencePct !== null && nextConfidencePct >= MANUAL_WATCHLIST_CONFIDENCE) {
        setWatchlistDecisionMessage('This setup has moderate confidence. Review before adding to your Watch List.');
      } else {
        setWatchlistDecisionMessage('Confidence is below 60%. Not added to Watch List.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze ticker.';
      setError(message === 'Failed to fetch' ? 'Could not reach the analysis API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setLoading(false);
    }
  }

  async function saveWatchlistForAnalysis(analysis: AnalyzeResponse, mode: 'auto' | 'manual') {
    const analysisSymbol = analysis.meta?.symbol ?? (analysis.quote ? symbol : undefined) ?? symbol;
    const analysisThesis = analysis.thesis;

    if (!analysisThesis || !analysisSymbol) {
      setError('An active thesis is required to save to the watchlist.');
      return;
    }

    const allSignals = [
      ...(analysis.signalDetails ?? []),
      ...(analysis.thesisRecord?.evidence?.signalDetails ?? []),
    ];
    const riskFields = analysis.riskFields ?? deriveTradeRiskFields(analysisThesis, allSignals);
    const plan = getTradePlan(analysisThesis, allSignals);
    const analysisNews = analysis.news?.filter((item) => item.headline).slice(0, 5) ?? [];

    setSavingWatchlist(true);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/watchlist`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          symbol: analysisSymbol,
          direction: analysisThesis.direction,
          suggestedAction: analysisThesis.suggestedAction,
          confidenceScore: analysisThesis.confidenceScore,
          startPrice: analysis.quote?.price ?? analysis.thesisRecord?.initialPrice ?? null,
          thesis: analysisThesis.thesis,
          entryTrigger: plan.entryTrigger,
          invalidation: plan.invalidation,
          entryZone: analysisThesis.setup?.entryZone,
          stopLossTrigger: analysisThesis.setup?.stopLoss,
          takeProfitTrigger: analysisThesis.setup?.takeProfit,
          timeHorizon: analysisThesis.timeHorizon,
          watchConditions: plan.watchConditions,
          riskExplanation: analysisThesis.riskExplanation,
          news: analysisNews,
          traceId: analysis.traceId ?? analysisThesis.traceId,
          volumeConfirmation: riskFields.volumeConfirmation,
          trendStrength: riskFields.trendStrength,
          marketCondition: riskFields.marketCondition,
          triggerType: riskFields.triggerType,
        }),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not save this watchlist entry.');
      }

      const entry = data.entry;
      setSavedEntry(entry);
      setWatchlistEntries((entries) => [entry, ...entries.filter((currentEntry) => currentEntry.symbol !== entry.symbol)]);
      setWatchlistDecisionMessage(
        mode === 'auto'
          ? 'Added to Watch List automatically because confidence is 75% or higher.'
          : 'Added to Watch List.'
      );
      if (mode === 'manual') {
        setAnalysisModalOpen(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this watchlist entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setSavingWatchlist(false);
    }
  }

  async function handleAddToWatchlist() {
    if (!result) return;
    await saveWatchlistForAnalysis(result, 'manual');
  }

  const thesis = result?.thesis;
  const quote = result?.quote;
  const candles = result?.candles ?? [];
  const setup = thesis?.setup;
  const instrument = result?.meta?.instrument;
  const symbolLabel = thesis?.symbol ?? quote?.symbol ?? result?.meta?.symbol ?? symbol.toUpperCase();
  const priceChangePct = useMemo(() => {
    if (!quote?.price || !quote.previousClose) return null;
    return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  }, [quote]);
  const isPositive = (priceChangePct ?? 0) >= 0;
  const confidence = typeof thesis?.confidenceScore === 'number' ? thesis.confidenceScore : null;
  const confidencePct = confidence === null ? null : Math.round(confidence * 100);

  const allSignals = useMemo(
    () => [...(result?.signalDetails ?? []), ...(result?.thesisRecord?.evidence?.signalDetails ?? [])],
    [result]
  );
  const featuredSignals = useMemo(() => getFeaturedSignals(allSignals), [allSignals]);
  const topNews = useMemo(() => result?.news?.filter((item) => item.headline).slice(0, 3) ?? [], [result]);
  const tradePlan = useMemo(() => (thesis ? getTradePlan(thesis, allSignals) : null), [thesis, allSignals]);

  return (
    <main className="min-h-screen bg-zinc-50 p-4 font-sans text-zinc-950 transition-colors duration-200 dark:bg-black dark:text-zinc-50 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Desk Header */}
        <header className={CARD_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">SHADOW TRADER</h1>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    DESK
                  </span>
                  {isStreaming && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Radio className="h-3 w-3 animate-pulse" />
                      LIVE SSE
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  AI-assisted day trade scanner with transparent risk gates and backtesting
                </p>
              </div>
            </div>

            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void analyzeTicker();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <div className="flex rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 text-xs font-bold dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => setAssetClass('crypto')}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    assetClass === 'crypto'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  Crypto
                </button>
                <button
                  type="button"
                  onClick={() => setAssetClass('stock')}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    assetClass === 'stock'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  Stock
                </button>
              </div>

              <input
                type="text"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder={assetClass === 'crypto' ? 'BTC/USD' : 'NVDA'}
                disabled={loading}
                className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base font-bold uppercase outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 dark:disabled:bg-zinc-800"
              />

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Scanning...' : 'Scan Setup'}
              </button>

              <button
                type="button"
                onClick={() => setBacktestModalOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
              >
                <BarChart2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Backtest
              </button>
            </form>

            <div className="flex items-center gap-2">
              {SHOW_DEV_RESET && (
                <button
                  type="button"
                  aria-label="Reset development data"
                  title="Reset development data"
                  disabled={resettingDemoData}
                  onClick={() => void handleResetDemoData()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 shadow-sm transition hover:border-red-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:border-red-700 dark:hover:bg-red-950"
                >
                  <DatabaseZap className={`h-4 w-4 ${resettingDemoData ? 'animate-pulse' : ''}`} />
                </button>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setDarkMode((enabled) => !enabled)}
                className="inline-flex h-9 w-16 items-center rounded-full border border-zinc-300 bg-zinc-100 p-1 shadow-sm transition hover:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm transition-transform dark:bg-emerald-500 dark:text-white ${
                    darkMode ? 'translate-x-7' : 'translate-x-0'
                  }`}
                >
                  {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                </span>
              </button>

              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:text-red-300"
              >
                <LogOut className={`h-4 w-4 ${loggingOut ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          </div>

          {resetMessage && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
              {resetMessage}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-800">
              {error}
            </div>
          )}
        </header>

        {/* Workspace Grid */}
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          <InstrumentRail
            activeSymbol={symbol}
            loading={loading}
            onSelect={(nextSymbol) => {
              const nextAssetClass = nextSymbol.includes('/') ? 'crypto' : 'stock';
              setAssetClass(nextAssetClass);
              void analyzeTicker(nextSymbol, nextAssetClass);
            }}
          />

          <section className="grid gap-4">
            <DeskChartPanel
              symbol={symbolLabel}
              quote={quote}
              candles={candles}
              priceChangePct={priceChangePct}
              isPositive={isPositive}
              instrument={instrument}
              loading={loading}
              livePolling={livePolling}
              lastLiveRefresh={lastLiveRefresh}
              onRefresh={() => void refreshMarketSnapshot()}
            />

            <section className={CARD_CLASS}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
                    Core Technical Signals
                  </p>
                  <h3 className="mt-1 text-xl font-bold">Indicator Confluence Matrix</h3>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {featuredSignals.length} active indicators
                </span>
              </div>

              <div className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
                {featuredSignals.length > 0 ? (
                  featuredSignals.map((signal) => (
                    <SignalRow key={signal.type ?? signal.label} signal={signal} />
                  ))
                ) : (
                  <EmptyState
                    title="No indicator confluence yet"
                    body="Run an analysis to inspect technical indicator alignments."
                  />
                )}
              </div>
            </section>
          </section>

          <SetupTicket
            symbol={symbolLabel}
            thesis={thesis}
            setup={setup}
            confidencePct={confidencePct}
            quote={quote}
            plan={tradePlan}
            saving={savingWatchlist}
            savedEntry={savedEntry}
            decisionMessage={watchlistDecisionMessage}
            onAddToWatchlist={handleAddToWatchlist}
            onOpenDetails={() => setAnalysisModalOpen(true)}
          />
        </div>

        {loading && (
          <section className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </section>
        )}

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <WatchlistCard
            entries={watchlistEntries}
            loading={loadingWatchlist}
            updatingStatusId={updatingWatchlistStatusId}
            evaluatingGateId={evaluatingGateId}
            quantityDrafts={quantityDrafts}
            onRefresh={() => void loadWorkflow()}
            onUpdateStatus={handleUpdateWatchlistStatus}
            onEvaluateGate={handleEvaluateRiskGate}
            onConfirmOpenTrade={handleConfirmOpenTrade}
            onSkipConfirmation={handleSkipPendingConfirmation}
            onQuantityChange={(entryId, value) =>
              setQuantityDrafts((drafts) => ({ ...drafts, [entryId]: value }))
            }
            onViewThesis={setSelectedWatchlistEntry}
          />

          <div className="grid gap-4">
            <TradeListCard
              entries={tradeEntries}
              closingTradeId={closingTradeId}
              updatingPaperTradeId={updatingPaperTradeId}
              markPriceDrafts={markPriceDrafts}
              onMarkPriceChange={(entryId, value) =>
                setMarkPriceDrafts((drafts) => ({ ...drafts, [entryId]: value }))
              }
              onUpdatePaperTrade={handleUpdatePaperTrade}
              onCloseTrade={handleCloseTrade}
            />

            <TrustLedgerCard
              entries={ledgerEntries}
              onClear={() => void handleClearTrustLedger()}
              clearing={clearingLedger}
              onDeleteEntry={(id) => void handleDeleteLedgerEntry(id)}
              deletingId={deletingLedgerId}
            />
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
          decisionMessage={watchlistDecisionMessage}
          onAddToWatchlist={handleAddToWatchlist}
          onClose={() => setAnalysisModalOpen(false)}
        />
      )}

      <WatchlistThesisModal
        entry={selectedWatchlistEntry}
        onClose={() => setSelectedWatchlistEntry(null)}
      />

      <BacktestModal
        symbol={symbolLabel}
        isOpen={backtestModalOpen}
        onClose={() => setBacktestModalOpen(false)}
      />

      <PendingConfirmationModal
        entry={pendingConfirmationEntry}
        quantity={
          pendingConfirmationEntry
            ? quantityDrafts[pendingConfirmationEntry.id] ??
              String(pendingConfirmationEntry.positionSize ?? 20)
            : '20'
        }
        updating={
          pendingConfirmationEntry
            ? updatingWatchlistStatusId === pendingConfirmationEntry.id
            : false
        }
        onQuantityChange={(value) => {
          if (!pendingConfirmationEntry) return;
          setQuantityDrafts((drafts) => ({ ...drafts, [pendingConfirmationEntry.id]: value }));
        }}
        onConfirm={() => {
          if (pendingConfirmationEntry) void handleConfirmOpenTrade(pendingConfirmationEntry);
        }}
        onSkip={() => {
          if (pendingConfirmationEntry) void handleSkipPendingConfirmation(pendingConfirmationEntry);
        }}
        onClose={() => setPendingConfirmationEntry(null)}
      />

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
}
