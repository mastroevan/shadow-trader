'use client';

import { useCallback, useRef, useState } from 'react';
import { API_BASE_URL } from '../constants';
import {
  LedgerEntry,
  SavedWatchlistEntry,
  ToastState,
  TradeEntry,
  WatchlistStatus,
} from '../types';
import { formatCurrency, parseFirstPriceLevel } from '../utils/formatters';
import { isTriggeredReviewStatus } from '../utils/tradeLogic';

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

export function useWatchlist({
  onError,
}: {
  onError?: (msg: string) => void;
} = {}) {
  const [watchlistEntries, setWatchlistEntries] = useState<SavedWatchlistEntry[]>([]);
  const [tradeEntries, setTradeEntries] = useState<TradeEntry[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [updatingWatchlistStatusId, setUpdatingWatchlistStatusId] = useState<string | null>(null);
  const [evaluatingGateId, setEvaluatingGateId] = useState<string | null>(null);
  const [clearingLedger, setClearingLedger] = useState(false);
  const [deletingLedgerId, setDeletingLedgerId] = useState<string | null>(null);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [updatingPaperTradeId, setUpdatingPaperTradeId] = useState<string | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [markPriceDrafts, setMarkPriceDrafts] = useState<Record<string, string>>({});
  const [pendingConfirmationEntry, setPendingConfirmationEntry] = useState<SavedWatchlistEntry | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const knownPendingIds = useRef<Set<string>>(new Set());
  const knownWarningKeys = useRef<Set<string>>(new Set());

  const showToast = useCallback((nextToast: Omit<ToastState, 'id'>) => {
    setToast({
      ...nextToast,
      id: Date.now(),
    });
  }, []);

  const showWorkflowToasts = useCallback((entries: SavedWatchlistEntry[]) => {
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
  }, [showToast]);

  const loadWorkflow = useCallback(async () => {
    setLoadingWatchlist(true);

    try {
      const [watchlistResponse, tradeResponse, ledgerResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/watchlist`, { headers: apiHeaders() }),
        fetch(`${API_BASE_URL}/trade-list`, { headers: apiHeaders() }),
        fetch(`${API_BASE_URL}/trust-ledger`, { headers: apiHeaders() }),
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
  }, [showWorkflowToasts]);

  const handleEvaluateRiskGate = useCallback(async (entryId: string) => {
    setEvaluatingGateId(entryId);

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${entryId}/evaluate-gate`, {
        method: 'POST',
        headers: apiHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.entry) {
        throw new Error(data.message || 'Failed to evaluate risk gate.');
      }

      setWatchlistEntries((entries) =>
        entries.map((item) => (item.id === entryId ? data.entry : item))
      );

      const isApproved = data.evaluation?.approved || data.entry.gateStatus === 'APPROVED';
      showToast({
        type: isApproved ? 'success' : 'warning',
        title: `Risk Gate: ${data.entry.symbol} ${isApproved ? 'Approved' : 'Rejected'}`,
        body: isApproved
          ? `Trade approved. Sized ${data.entry.positionSize ?? 0} units at ${formatCurrency(data.entry.entryPrice ?? undefined)}.`
          : data.evaluation?.reasons?.join(', ') || 'Trade failed one or more risk checks.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not evaluate risk gate.';
      onError?.(msg);
    } finally {
      setEvaluatingGateId(null);
    }
  }, [onError, showToast]);

  const handleUpdateWatchlistStatus = useCallback(async (entryId: string, status: WatchlistStatus) => {
    setUpdatingWatchlistStatusId(entryId);

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${entryId}/status`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ status }),
      });

      const data = (await response.json()) as {
        entry?: SavedWatchlistEntry | TradeEntry | LedgerEntry;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not update this watchlist status.');
      }

      setWatchlistEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      if (data.entry.status === 'Triggered') {
        setTradeEntries((entries) => [
          data.entry as TradeEntry,
          ...entries.filter((entry) => entry.id !== entryId),
        ]);
      } else {
        setLedgerEntries((entries) => [data.entry as LedgerEntry, ...entries]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this watchlist status.';
      onError?.(message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }, [onError]);

  const handleConfirmOpenTrade = useCallback(async (entry: SavedWatchlistEntry) => {
    const quantity = Number(quantityDrafts[entry.id] ?? entry.positionSize ?? 20);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      onError?.('Enter a valid quantity before opening this trade.');
      return;
    }

    setUpdatingWatchlistStatusId(entry.id);

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${entry.id}/paper-trade`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          entryPrice: entry.triggerPrice ?? entry.startPrice,
          quantity,
          notes: entry.triggerReason
            ? `Opened after trigger confirmation: ${entry.triggerReason}`
            : 'Opened from saved setup.',
        }),
      });

      const data = (await response.json()) as { entry?: TradeEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not open this paper trade.');
      }

      setWatchlistEntries((entries) => entries.filter((currentEntry) => currentEntry.id !== entry.id));
      setTradeEntries((entries) => [
        data.entry!,
        ...entries.filter((currentEntry) => currentEntry.id !== entry.id),
      ]);
      setPendingConfirmationEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setQuantityDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
      showToast({
        type: 'success',
        title: `Paper trade opened: ${entry.symbol}`,
        body: `Bought ${quantity} units at ${formatCurrency(entry.triggerPrice ?? entry.startPrice ?? undefined)}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open this paper trade.';
      onError?.(message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }, [onError, quantityDrafts, showToast]);

  const handleSkipPendingConfirmation = useCallback(async (entry: SavedWatchlistEntry) => {
    setUpdatingWatchlistStatusId(entry.id);

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${entry.id}/skip-confirmation`, {
        method: 'POST',
        headers: apiHeaders(),
      });

      const data = (await response.json()) as { entry?: SavedWatchlistEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not skip this setup.');
      }

      setWatchlistEntries((entries) =>
        entries.map((currentEntry) => (currentEntry.id === entry.id ? data.entry! : currentEntry))
      );
      setPendingConfirmationEntry((currentEntry) => (currentEntry?.id === entry.id ? null : currentEntry));
      setQuantityDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not skip this setup.';
      onError?.(message);
    } finally {
      setUpdatingWatchlistStatusId(null);
    }
  }, [onError]);

  const handleCloseTrade = useCallback(async (entryId: string, outcome: 'Win' | 'Loss') => {
    setClosingTradeId(entryId);

    try {
      const trade = tradeEntries.find((entry) => entry.id === entryId);
      const response = await fetch(`${API_BASE_URL}/trade-list/${entryId}/close`, {
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
      showToast({
        type: outcome === 'Win' ? 'success' : 'warning',
        title: `Trade closed: ${data.entry.symbol} (${outcome})`,
        body: `Realized P&L: ${formatCurrency(data.entry.profitLoss ?? 0)} (${data.entry.profitLossPercent ? `${(data.entry.profitLossPercent * 100).toFixed(1)}%` : '0%'}).`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not close this trade.';
      onError?.(message);
    } finally {
      setClosingTradeId(null);
    }
  }, [onError, showToast, tradeEntries]);

  const handleUpdatePaperTrade = useCallback(async (entryId: string) => {
    const currentPrice = Number(markPriceDrafts[entryId]);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      onError?.('Enter a valid mark price before updating the paper trade.');
      return;
    }

    setUpdatingPaperTradeId(entryId);

    try {
      const response = await fetch(`${API_BASE_URL}/paper-trades/${entryId}`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ currentPrice }),
      });

      const data = (await response.json()) as { entry?: TradeEntry; message?: string; error?: string };

      if (!response.ok || !data.entry) {
        throw new Error(data.message ?? data.error ?? 'Could not update this paper trade.');
      }

      setTradeEntries((entries) =>
        entries.map((entry) => (entry.id === entryId ? data.entry! : entry))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this paper trade.';
      onError?.(message);
    } finally {
      setUpdatingPaperTradeId(null);
    }
  }, [markPriceDrafts, onError]);

  const handleDeleteLedgerEntry = useCallback(async (id: string) => {
    setDeletingLedgerId(id);

    try {
      const response = await fetch(`${API_BASE_URL}/trust-ledger/${id}`, {
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
      onError?.(message);
    } finally {
      setDeletingLedgerId(null);
    }
  }, [onError]);

  const handleClearTrustLedger = useCallback(async () => {
    const confirmed = window.confirm('Clear all trust ledger history? This cannot be undone.');
    if (!confirmed) return;

    setClearingLedger(true);

    try {
      const response = await fetch(`${API_BASE_URL}/trust-ledger`, {
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
      onError?.(message);
    } finally {
      setClearingLedger(false);
    }
  }, [onError]);

  const [brokerStatus, setBrokerStatus] = useState<import('../types').BrokerStatusResult | null>(null);

  const fetchBrokerStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/brokers/status`, { headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBrokerStatus(data);
      }
    } catch {
      // Graceful fallback if broker route isn't available
    }
  }, []);

  const handleExecuteBrokerTrade = useCallback(
    async (
      id: string,
      options: {
        broker?: 'ALPACA' | 'COINBASE' | 'SIMULATED';
        executionMode?: 'PAPER' | 'LIVE';
        quantity?: number;
      } = {}
    ) => {
      setUpdatingWatchlistStatusId(id);
      try {
        const response = await fetch(`${API_BASE_URL}/watchlist/${id}/broker-execute`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify(options),
        });

        if (response.status === 422) {
          const data = (await response.json().catch(() => ({}))) as { reasons?: string[]; message?: string };
          showToast({
            type: 'warning',
            title: 'Risk Gate Rejected Order',
            body: data.reasons?.join(', ') || data.message || 'Setup failed risk gate.',
          });
          return;
        }

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message || 'Broker execution failed.');
        }

        const data = await response.json();
        showToast({
          type: 'success',
          title: `Order Executed via ${data.order?.broker || 'Broker'}`,
          body: `${data.entry?.symbol} | Size: ${data.order?.qty} | Status: ${data.order?.status}`,
        });

        await loadWorkflow();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Broker execution failed.';
        onError?.(message);
      } finally {
        setUpdatingWatchlistStatusId(null);
      }
    },
    [loadWorkflow, onError, showToast]
  );

  const handleSyncBrokerTrade = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE_URL}/trade-list/${id}/broker-sync`, {
          method: 'POST',
          headers: apiHeaders(),
        });
        if (res.ok) {
          showToast({
            type: 'success',
            title: 'Broker Synchronized',
            body: 'Trade fill status and mark price synced with broker.',
          });
          await loadWorkflow();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Broker sync failed.';
        onError?.(message);
      }
    },
    [loadWorkflow, onError, showToast]
  );

  return {
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
    brokerStatus,
    toast,
    setToast,
    setWatchlistEntries,
    setTradeEntries,
    setLedgerEntries,
    setQuantityDrafts,
    setMarkPriceDrafts,
    setPendingConfirmationEntry,
    loadWorkflow,
    fetchBrokerStatus,
    handleEvaluateRiskGate,
    handleUpdateWatchlistStatus,
    handleConfirmOpenTrade,
    handleSkipPendingConfirmation,
    handleCloseTrade,
    handleUpdatePaperTrade,
    handleDeleteLedgerEntry,
    handleClearTrustLedger,
    handleExecuteBrokerTrade,
    handleSyncBrokerTrade,
    showToast,
  };
}

