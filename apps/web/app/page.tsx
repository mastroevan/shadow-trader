'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Activity,
  BarChart3,
  DatabaseZap,
  LogOut,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import {
  AnalyzeResponse,
  AssetClass,
  LedgerEntry,
  MarketSnapshotResponse,
  SavedWatchlistEntry,
  ToastState,
  TradeEntry,
  WatchlistStatus,
} from './types';
import {
  API_BASE_URL,
  AUTO_WATCHLIST_CONFIDENCE,
  CARD_CLASS,
  LIVE_POLL_INTERVAL_MS,
  MANUAL_WATCHLIST_CONFIDENCE,
  SHOW_DEV_RESET,
  THEME_STORAGE_KEY,
} from './constants';
import {
  formatCurrency,
  parseFirstPriceLevel,
} from './utils/formatters';
import {
  deriveTradeRiskFields,
  getConfidencePct,
  getFeaturedSignals,
  getTradePlan,
  isTriggeredReviewStatus,
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
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [symbol, setSymbol] = useState('BTC/USD');
  const [assetClass, setAssetClass] = useState<AssetClass>('crypto');
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
  const [updatingPaperTradeId, setUpdatingPaperTradeId] = useState<string | null>(null);
  const [markPriceDrafts, setMarkPriceDrafts] = useState<Record<string, string>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [pendingConfirmationEntry, setPendingConfirmationEntry] = useState<SavedWatchlistEntry | null>(null);
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(false);
  const [resettingDemoData, setResettingDemoData] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [clearingLedger, setClearingLedger] = useState(false);
  const [deletingLedgerId, setDeletingLedgerId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [watchlistDecisionMessage, setWatchlistDecisionMessage] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const knownPendingIds = useRef<Set<string>>(new Set());
  const knownWarningKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadWorkflow();
    // Mount-once load; loadWorkflow is also called explicitly by refresh actions elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(null), 7000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!result?.quote || loading) return;

    const interval = window.setInterval(() => {
      void refreshMarketSnapshot();
    }, LIVE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
    // Deliberately scoped to instrument identity, not the full result/function identity,
    // so a live refresh's own response doesn't reset this interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.meta?.symbol, result?.meta?.instrument?.assetClass, result?.meta?.instrument?.timeframe, loading]);

  async function loadWorkflow() {
    setLoadingWatchlist(true);

    try {
      const [watchlistResponse, tradeResponse, ledgerResponse] = await Promise.all([
        apiFetch(`${API_BASE_URL}/watchlist`, { headers: apiHeaders() }),
        apiFetch(`${API_BASE_URL}/trade-list`, { headers: apiHeaders() }),
        apiFetch(`${API_BASE_URL}/trust-ledger`, { headers: apiHeaders() }),
      ]);

      if (watchlistResponse.ok) {
        const data = (await watchlistResponse.json()) as { entries?: SavedWatchlistEntry[] };
        const entries = data.entries ?? [];
        setWatchlistEntries(entries);
        showWorkflowToasts(entries);
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

  function showToast(nextToast: Omit<ToastState, 'id'>) {
    setToast({
      ...nextToast,
      id: Date.now(),
    });
  }

  function showWorkflowToasts(entries: SavedWatchlistEntry[]) {
    const warningEntry = entries.find((entry) => {
      if (!entry.triggerWarning || !entry.triggerWarningAt) return false;
      return !knownWarningKeys.current.has(`${entry.id}:${entry.triggerWarningAt}`);
    });
    entries.forEach((entry) => {
      if (entry.triggerWarning && entry.triggerWarningAt) {
        knownWarningKeys.current.add(`${entry.id}:${entry.triggerWarningAt}`);
      }
    });

    if (warningEntry) {
      showToast({
        type: 'warning',
        title: `Setup trigger blocked: ${warningEntry.symbol}`,
        body: warningEntry.triggerWarning ?? 'Invalid stop or target levels.',
      });
    }

    const pendingEntries = entries.filter((entry) => isTriggeredReviewStatus(entry.status));
    const newestPendingEntry = pendingEntries.find((entry) => !knownPendingIds.current.has(entry.id));

    pendingEntries.forEach((entry) => knownPendingIds.current.add(entry.id));

    if (!newestPendingEntry) return;

    showToast({
      type: 'success',
      title: `Trade setup triggered: ${newestPendingEntry.symbol}`,
      body: `Entry: ${formatCurrency(newestPendingEntry.triggerPrice ?? newestPendingEntry.startPrice ?? undefined)} | Stop: ${formatCurrency(parseFirstPriceLevel(newestPendingEntry.stopLossTrigger) ?? undefined)} | Target: ${formatCurrency(parseFirstPriceLevel(newestPendingEntry.takeProfitTrigger) ?? undefined)}`,
    });
    setQuantityDrafts((drafts) => ({
      ...drafts,
      [newestPendingEntry.id]: drafts[newestPendingEntry.id] ?? String(newestPendingEntry.positionSize ?? 20),
    }));
    setPendingConfirmationEntry(newestPendingEntry);
  }

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
      knownPendingIds.current.clear();
      knownWarningKeys.current.clear();
      setLastLiveRefresh(null);

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

  async function handleClearTrustLedger() {
    const confirmed = window.confirm('Clear all trust ledger history? This cannot be undone.');

    if (!confirmed) return;

    setClearingLedger(true);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/trust-ledger`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message ?? data.error ?? 'Could not clear the trust ledger.');
      }

      setLedgerEntries([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not clear the trust ledger.';
      setError(message === 'Failed to fetch' ? 'Could not reach the API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setClearingLedger(false);
    }
  }

  async function handleDeleteLedgerEntry(id: string) {
    setDeletingLedgerId(id);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/trust-ledger/${id}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });

      if (!response.ok && response.status !== 404) {
        const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message ?? data.error ?? 'Could not delete the ledger entry.');
      }

      setLedgerEntries((entries) => entries.filter((entry) => entry.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the ledger entry.';
      setError(message === 'Failed to fetch' ? 'Could not reach the API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setDeletingLedgerId(null);
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
      setLastLiveRefresh(data.meta?.analyzedAt ?? new Date().toISOString());
      setAnalysisModalOpen(true);

      const nextConfidencePct = getConfidencePct(data.thesis);
      if (nextConfidencePct !== null && nextConfidencePct >= AUTO_WATCHLIST_CONFIDENCE) {
        await saveWatchlistForAnalysis(data, 'auto');
      } else if (nextConfidencePct !== null && nextConfidencePct >= MANUAL_WATCHLIST_CONFIDENCE) {
        setWatchlistDecisionMessage('This setup has moderate confidence. Review before adding to your Watch List.');
      } else if (nextConfidencePct !== null) {
        setWatchlistDecisionMessage('Rejected automatically because confidence is below 60%.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message === 'Failed to fetch' ? 'Could not reach the analysis API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshMarketSnapshot() {
    const currentSymbol = result?.meta?.symbol ?? symbol;

    if (!currentSymbol || livePolling) return;

    setLivePolling(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/market/snapshot`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          symbol: currentSymbol,
          assetClass: result?.meta?.instrument?.assetClass ?? assetClass,
          timeframe: result?.meta?.instrument?.timeframe,
          exchange: result?.meta?.instrument?.exchange,
        }),
      });
      const data = (await response.json()) as MarketSnapshotResponse;

      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? `Request failed with status ${response.status}`);
      }

      setResult((current) => {
        if (!current) return current;

        return {
          ...current,
          quote: data.quote ?? current.quote,
          candles: data.candles ?? current.candles,
          meta: {
            ...current.meta,
            ...data.meta,
          },
        };
      });
      setLastLiveRefresh(data.meta?.refreshedAt ?? new Date().toISOString());
    } catch {
      // Keep the last valid setup visible when a live refresh fails.
    } finally {
      setLivePolling(false);
    }
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void analyzeTicker();
  }

  async function saveWatchlistForAnalysis(analysis: AnalyzeResponse, mode: 'auto' | 'manual') {
    const analysisThesis = analysis.thesis;
    if (!analysisThesis) return;

    const analysisConfidencePct = getConfidencePct(analysisThesis);
    if (analysisConfidencePct !== null && analysisConfidencePct < MANUAL_WATCHLIST_CONFIDENCE) {
      setWatchlistDecisionMessage('Rejected automatically because confidence is below 60%.');
      return;
    }

    const analysisSignals = analysis.signalDetails ?? [];
    const plan = getTradePlan(analysisThesis, getFeaturedSignals(analysisSignals));
    const riskFields = analysis.riskFields ?? deriveTradeRiskFields(analysisThesis, analysisSignals);
    const analysisSymbol =
      analysisThesis.symbol ??
      analysis.quote?.symbol ??
      analysis.meta?.symbol ??
      symbol.toUpperCase();
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

  async function handleUpdateWatchlistStatus(entryId: string, status: WatchlistStatus) {
    setUpdatingWatchlistStatusId(entryId);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/watchlist/${entryId}/status`, {
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
      setSavedEntry((entry) => (entry?.id === entryId ? null : entry));
      setSelectedWatchlistEntry((entry) => (entry?.id === entryId ? null : entry));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this watchlist status.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }

  async function handleConfirmOpenTrade(entry: SavedWatchlistEntry) {
    const quantity = Number(quantityDrafts[entry.id] ?? entry.positionSize ?? 20);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a valid quantity before opening this trade.');
      return;
    }

    setUpdatingWatchlistStatusId(entry.id);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/watchlist/${entry.id}/paper-trade`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          entryPrice: entry.triggerPrice ?? entry.startPrice,
          quantity,
          notes: entry.triggerReason ? `Opened after trigger confirmation: ${entry.triggerReason}` : 'Opened from saved setup.',
        }),
      });

      const data = (await response.json()) as { entry?: TradeEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not open this paper trade.');
      }

      setWatchlistEntries((entries) => entries.filter((currentEntry) => currentEntry.id !== entry.id));
      setTradeEntries((entries) => [data.entry!, ...entries.filter((currentEntry) => currentEntry.id !== entry.id)]);
      setSavedEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setSelectedWatchlistEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setPendingConfirmationEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setQuantityDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open this paper trade.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }

  async function handleSkipPendingConfirmation(entry: SavedWatchlistEntry) {
    setUpdatingWatchlistStatusId(entry.id);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/watchlist/${entry.id}/skip-confirmation`, {
        method: 'POST',
        headers: apiHeaders(),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not skip this setup.');
      }

      setWatchlistEntries((entries) => entries.map((currentEntry) => (currentEntry.id === entry.id ? data.entry! : currentEntry)));
      setPendingConfirmationEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setQuantityDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not skip this setup.';
      setError(message === 'Failed to fetch' ? 'Could not reach the watchlist API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }

  async function handleUpdatePaperTrade(entryId: string) {
    const currentPrice = Number(markPriceDrafts[entryId]);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      setError('Enter a valid mark price before updating the paper trade.');
      return;
    }

    setUpdatingPaperTradeId(entryId);
    setError('');

    try {
      const response = await apiFetch(`${API_BASE_URL}/paper-trades/${entryId}`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ currentPrice }),
      });

      const data = (await response.json()) as { entry?: TradeEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not update this paper trade.');
      }

      setTradeEntries((entries) => entries.map((entry) => (entry.id === entryId ? data.entry! : entry)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this paper trade.';
      setError(message === 'Failed to fetch' ? 'Could not reach the paper trade API. Make sure the backend is running on port 3001.' : message);
    } finally {
      setUpdatingPaperTradeId(null);
    }
  }

  async function handleCloseTrade(entryId: string, outcome: 'Win' | 'Loss') {
    setClosingTradeId(entryId);
    setError('');

    try {
      const trade = tradeEntries.find((entry) => entry.id === entryId);
      const response = await apiFetch(`${API_BASE_URL}/trade-list/${entryId}/close`, {
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
  const allSignals = result?.signalDetails ?? [];
  const topNews = result?.news?.filter((item) => item.headline).slice(0, 5) ?? [];
  const featuredSignals = getFeaturedSignals(allSignals);
  const tradePlan = thesis ? getTradePlan(thesis, featuredSignals) : null;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-4 text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-zinc-50 md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white dark:bg-emerald-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Shadow Trader</p>
                <h1 className="text-2xl font-bold tracking-normal">Trading desk</h1>
              </div>
            </div>

            <form onSubmit={handleAnalyze} className="grid gap-3 lg:grid-cols-[auto_1fr_auto] xl:min-w-[720px]">
              <div className="inline-grid grid-cols-2 rounded-lg border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-950">
                {(['crypto', 'stock'] as AssetClass[]).map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => setAssetClass(asset)}
                    className={`min-h-10 rounded-md px-4 text-sm font-bold capitalize transition ${
                      assetClass === asset
                        ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    {asset}
                  </button>
                ))}
              </div>

              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder={assetClass === 'crypto' ? 'BTC/USD' : 'NVDA'}
                disabled={loading}
                className="min-h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg font-bold uppercase outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 dark:disabled:bg-zinc-800"
              />

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Scanning...' : 'Scan Setup'}
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 shadow-sm transition hover:border-red-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:border-red-700 dark:hover:bg-red-950"
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
                className="inline-flex h-10 w-20 items-center rounded-full border border-zinc-300 bg-zinc-100 p-1 shadow-sm transition hover:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-emerald-500/20"
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm transition-transform dark:bg-emerald-500 dark:text-white ${
                    darkMode ? 'translate-x-10' : 'translate-x-0'
                  }`}
                >
                  {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </span>
              </button>

              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:text-red-300"
              >
                <LogOut className={`h-4 w-4 ${loggingOut ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          </div>

          {resetMessage && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
              {resetMessage}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}
        </header>

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
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                  <h2 className="text-xl font-bold">Intraday signals</h2>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {featuredSignals.length} active
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {featuredSignals.length > 0 ? (
                  featuredSignals.map((signal, index) => (
                    <SignalRow key={`${signal.type}-${signal.label}-${index}`} signal={signal} />
                  ))
                ) : (
                  <EmptyState
                    title="No signal scan yet"
                    body="Run a setup scan to populate VWAP, EMA, RSI, volume, range, and liquidity context."
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
            quantityDrafts={quantityDrafts}
            onRefresh={() => void loadWorkflow()}
            onUpdateStatus={handleUpdateWatchlistStatus}
            onConfirmOpenTrade={handleConfirmOpenTrade}
            onSkipConfirmation={handleSkipPendingConfirmation}
            onQuantityChange={(entryId, value) => setQuantityDrafts((drafts) => ({ ...drafts, [entryId]: value }))}
            onViewThesis={setSelectedWatchlistEntry}
          />

          <div className="grid gap-4">
            <TradeListCard
              entries={tradeEntries}
              closingTradeId={closingTradeId}
              updatingPaperTradeId={updatingPaperTradeId}
              markPriceDrafts={markPriceDrafts}
              onMarkPriceChange={(entryId, value) => setMarkPriceDrafts((drafts) => ({ ...drafts, [entryId]: value }))}
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

      <PendingConfirmationModal
        entry={pendingConfirmationEntry}
        quantity={
          pendingConfirmationEntry
            ? quantityDrafts[pendingConfirmationEntry.id] ?? String(pendingConfirmationEntry.positionSize ?? 20)
            : '20'
        }
        updating={pendingConfirmationEntry ? updatingWatchlistStatusId === pendingConfirmationEntry.id : false}
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
