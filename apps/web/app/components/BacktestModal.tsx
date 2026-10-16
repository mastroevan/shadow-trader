import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart2,
  CheckCircle2,
  Clock,
  DollarSign,
  Play,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE_URL } from '../constants';
import { BacktestResult, BacktestStrategy } from '../types';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { MiniStat } from './ui/MiniStat';

export function BacktestModal({
  symbol,
  isOpen,
  onClose,
}: {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbol || 'NVDA');
  const [strategy, setStrategy] = useState<BacktestStrategy>('BREAKOUT_MOMENTUM');
  const [lookbackDays, setLookbackDays] = useState(60);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleRunBacktest() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/backtest/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selectedSymbol,
          strategy,
          lookbackDays,
          initialCapital,
          riskPerTradePercent: riskPercent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Backtest failed to execute.');
      }

      const data: BacktestResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during backtest');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                Historical Replay & Strategy Backtesting
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Simulate thesis and strategy win/loss distribution on historical candle bars
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Controls Grid */}
        <div className="mt-5 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 sm:grid-cols-2 lg:grid-cols-5">
          {/* Symbol */}
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Ticker Symbol
            </label>
            <input
              type="text"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-bold text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Strategy Model
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as BacktestStrategy)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="BREAKOUT_MOMENTUM">Breakout Momentum</option>
              <option value="VWAP_PULLBACK">VWAP Pullback</option>
              <option value="MEAN_REVERSION">Mean Reversion</option>
            </select>
          </div>

          {/* Lookback Days */}
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Lookback Period
            </label>
            <div className="mt-1 flex gap-1">
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setLookbackDays(days)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                    lookbackDays === days
                      ? 'bg-emerald-600 text-white'
                      : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {/* Risk Percent */}
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              Risk Per Trade
            </label>
            <div className="mt-1 flex gap-1">
              {[0.5, 1.0, 2.0].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setRiskPercent(pct)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                    riskPercent === pct
                      ? 'bg-emerald-600 text-white'
                      : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-end">
            <button
              type="button"
              disabled={running}
              onClick={handleRunBacktest}
              className="inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white shadow transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {running ? (
                <>
                  <RotateCcw className="h-4 w-4 animate-spin" />
                  Simulating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Backtest
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results View */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase text-zinc-500">Net Profit & Return</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-bold ${
                      result.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(result.netProfit)}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      result.netReturnPercent >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    ({result.netReturnPercent > 0 ? '+' : ''}
                    {result.netReturnPercent}%)
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase text-zinc-500">Win Rate / Total Trades</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {result.winRate}%
                  </span>
                  <span className="text-xs font-semibold text-zinc-500">
                    ({result.wins}W / {result.losses}L of {result.totalTrades})
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase text-zinc-500">Profit Factor & Drawdown</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {result.profitFactor}x
                  </span>
                  <span className="text-xs font-semibold text-red-500">
                    Max DD: {formatCurrency(result.maxDrawdown)} ({result.maxDrawdownPercent}%)
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase text-zinc-500">Risk-Adjusted Ratios</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    Sharpe: {result.sharpeRatio}
                  </span>
                  <span className="text-xs font-semibold text-zinc-500">
                    Sortino: {result.sortinoRatio}
                  </span>
                </div>
              </div>
            </div>

            {/* Equity Curve Chart */}
            {result.equityCurve.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-300">
                      Portfolio Equity Curve (${result.initialCapital} Initial)
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500">
                    {result.candleCount} candles simulated
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="backtestEquityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val) => `$${val}`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-zinc-200 bg-white/95 p-2 text-xs shadow backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
                                <p className="font-bold text-zinc-900 dark:text-zinc-100">{data.date}</p>
                                <p className="font-semibold text-emerald-600">
                                  Equity: {formatCurrency(data.equity)}
                                </p>
                                <p className="text-zinc-500">
                                  Drawdown: {formatCurrency(data.drawdown)} ({data.drawdownPercent}%)
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#backtestEquityGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Trade Log Table */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
                Simulated Trade Replay Log ({result.trades.length} Trades)
              </h4>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-100 text-[11px] font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Dates</th>
                      <th className="px-3 py-2">Dir</th>
                      <th className="px-3 py-2">Entry</th>
                      <th className="px-3 py-2">Exit</th>
                      <th className="px-3 py-2">P&L ($)</th>
                      <th className="px-3 py-2">Return</th>
                      <th className="px-3 py-2">Exit Reason</th>
                      <th className="px-3 py-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                    {result.trades.map((trade) => (
                      <tr key={trade.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <td className="px-3 py-2 font-mono font-bold">{trade.id}</td>
                        <td className="px-3 py-2 text-zinc-500">
                          {trade.entryDate} &rarr; {trade.exitDate}
                        </td>
                        <td className="px-3 py-2 font-bold">{trade.direction}</td>
                        <td className="px-3 py-2">{formatCurrency(trade.entryPrice)}</td>
                        <td className="px-3 py-2">{formatCurrency(trade.exitPrice)}</td>
                        <td
                          className={`px-3 py-2 font-bold ${
                            trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {formatCurrency(trade.pnl)}
                        </td>
                        <td
                          className={`px-3 py-2 font-semibold ${
                            trade.pnlPercent >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {trade.pnlPercent > 0 ? '+' : ''}
                          {trade.pnlPercent}%
                        </td>
                        <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">
                          {trade.exitReason}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              trade.outcome === 'Win'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                            }`}
                          >
                            {trade.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
