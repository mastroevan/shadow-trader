'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, LIVE_POLL_INTERVAL_MS } from '../constants';
import { Candle, InstrumentMeta, MarketSnapshotResponse, Quote } from '../types';

export function useMarketSnapshot({
  symbol,
  instrument,
  enabled = true,
  onSnapshot,
}: {
  symbol?: string;
  instrument?: InstrumentMeta;
  enabled?: boolean;
  onSnapshot?: (data: MarketSnapshotResponse) => void;
}) {
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  const refreshMarketSnapshot = useCallback(async () => {
    if (!symbol) return;
    setLivePolling(true);

    try {
      const response = await fetch(`${API_BASE_URL}/market/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          assetClass: instrument?.assetClass,
          exchange: instrument?.exchange,
          timeframe: instrument?.timeframe,
        }),
      });

      if (!response.ok) return;

      const data: MarketSnapshotResponse = await response.json();
      setLastLiveRefresh(new Date().toLocaleTimeString());
      onSnapshotRef.current?.(data);
    } catch (err) {
      console.warn('Snapshot refresh failed:', err);
    } finally {
      setLivePolling(false);
    }
  }, [symbol, instrument?.assetClass, instrument?.exchange, instrument?.timeframe]);

  // Connect to SSE stream
  useEffect(() => {
    if (!enabled || !symbol) {
      setIsStreaming(false);
      return;
    }

    const params = new URLSearchParams({
      symbol,
      ...(instrument?.assetClass ? { assetClass: instrument.assetClass } : {}),
      ...(instrument?.exchange ? { exchange: instrument.exchange } : {}),
      ...(instrument?.timeframe ? { timeframe: instrument.timeframe } : {}),
    });

    const streamUrl = `${API_BASE_URL}/market/stream?${params.toString()}`;
    let eventSource: EventSource | null = null;
    let fallbackInterval: number | null = null;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('connected', () => {
        setIsStreaming(true);
        setStreamError(null);
      });

      eventSource.addEventListener('snapshot', (event: MessageEvent) => {
        try {
          const data: MarketSnapshotResponse = JSON.parse(event.data);
          setLastLiveRefresh(new Date().toLocaleTimeString());
          onSnapshotRef.current?.(data);
        } catch (parseErr) {
          console.warn('Failed to parse SSE snapshot payload:', parseErr);
        }
      });

      eventSource.onerror = () => {
        setIsStreaming(false);
        setStreamError('SSE connection dropped, falling back to interval refresh.');
        eventSource?.close();

        // Fallback to interval refresh
        if (!fallbackInterval) {
          fallbackInterval = window.setInterval(() => {
            void refreshMarketSnapshot();
          }, LIVE_POLL_INTERVAL_MS);
        }
      };
    } catch {
      // EventSource failed to instantiate, fallback to interval
      setIsStreaming(false);
      fallbackInterval = window.setInterval(() => {
        void refreshMarketSnapshot();
      }, LIVE_POLL_INTERVAL_MS);
    }

    return () => {
      eventSource?.close();
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      setIsStreaming(false);
    };
  }, [symbol, instrument?.assetClass, instrument?.exchange, instrument?.timeframe, enabled, refreshMarketSnapshot]);

  return {
    lastLiveRefresh,
    livePolling,
    isStreaming,
    streamError,
    refreshMarketSnapshot,
  };
}
