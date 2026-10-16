import React from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CARD_CLASS } from '../constants';
import { Candle, InstrumentMeta, Quote } from '../types';
import {
  compactCurrency,
  formatAnalysisTimeframe,
  formatCandleTime,
  formatCurrency,
  formatTime,
} from '../utils/formatters';
import { EmptyState } from './ui/EmptyState';
import { MiniStat } from './ui/MiniStat';

export function DeskChartPanel({
  symbol,
  quote,
  candles,
  priceChangePct,
  isPositive,
  instrument,
  loading,
  livePolling,
  lastLiveRefresh,
  onRefresh,
}: {
  symbol: string;
  quote?: Quote;
  candles: Candle[];
  priceChangePct: number | null;
  isPositive: boolean;
  instrument?: InstrumentMeta;
  loading: boolean;
  livePolling: boolean;
  lastLiveRefresh: string | null;
  onRefresh: () => void;
}) {
  const chartData = candles.slice(-80).map((candle) => ({
    ...candle,
    time: formatCandleTime(candle.timestamp),
    direction: candle.close >= candle.open ? 'up' : 'down',
  }));
  const closeValues = chartData.map((candle) => candle.close);
  const minClose = closeValues.length ? Math.min(...closeValues) : 0;
  const maxClose = closeValues.length ? Math.max(...closeValues) : 0;
  const padding = Math.max((maxClose - minClose) * 0.15, maxClose * 0.001, 1);

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-bold tracking-normal">{symbol}</h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {instrument?.assetClass ?? 'market'}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {formatAnalysisTimeframe(instrument?.timeframe ?? '5m')}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-5xl font-bold">{formatCurrency(quote?.price)}</p>
            <div
              className={`mb-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${
                isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {priceChangePct === null ? 'N/A' : `${priceChangePct.toFixed(2)}%`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
          <MiniStat label="Open" value={formatCurrency(quote?.open)} />
          <MiniStat label="High" value={formatCurrency(quote?.high)} />
          <MiniStat label="Low" value={formatCurrency(quote?.low)} />
        </div>
      </div>

      <div className="mt-6 h-[360px] rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <div className="h-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        ) : chartData.length > 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" vertical={false} />
              <XAxis dataKey="time" minTickGap={26} tick={{ fontSize: 11, fill: '#71717a' }} />
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={[minClose - padding, maxClose + padding]}
                tick={{ fontSize: 11, fill: '#71717a' }}
                width={72}
                tickFormatter={(value) => compactCurrency(Number(value))}
              />
              <YAxis yAxisId="volume" hide />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: '#d4d4d8', fontSize: 12 }}
                formatter={(value, name) => {
                  if (name === 'volume') return [Number(value).toLocaleString(), 'Volume'];
                  return [formatCurrency(Number(value)), String(name)];
                }}
              />
              <Bar yAxisId="volume" dataKey="volume" barSize={5} opacity={0.28}>
                {chartData.map((entry) => (
                  <Cell
                    key={`volume-${entry.timestamp}`}
                    fill={entry.direction === 'up' ? '#10b981' : '#ef4444'}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="close"
                name="Close"
                stroke="#059669"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {quote?.price && (
                <ReferenceLine
                  yAxisId="price"
                  y={quote.price}
                  stroke="#18181b"
                  strokeDasharray="4 4"
                  label={{
                    value: compactCurrency(quote.price),
                    position: 'insideTopRight',
                    fill: '#18181b',
                    fontSize: 11,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No candles loaded"
              body="Run a setup scan to load intraday OHLCV candles for this instrument."
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
          <span>Source: {quote?.source ?? 'N/A'}</span>
          <span>Candles: {candles.length}</span>
          <span>Exchange: {instrument?.exchange ?? 'N/A'}</span>
          <span>Live: {lastLiveRefresh ? formatTime(lastLiveRefresh) : 'Waiting'}</span>
        </div>
        <button
          type="button"
          disabled={livePolling || loading || !quote}
          onClick={onRefresh}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          <RefreshCw className={`h-4 w-4 ${livePolling ? 'animate-spin' : ''}`} />
          {livePolling ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
    </section>
  );
}
