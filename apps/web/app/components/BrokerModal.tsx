'use client';

import React from 'react';
import { X, ShieldCheck, Landmark, Coins, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { BrokerStatusResult } from '../types';
import { formatCurrency } from '../utils/formatters';

type BrokerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  brokerStatus: BrokerStatusResult | null;
  onRefresh?: () => void;
};

export function BrokerModal({
  isOpen,
  onClose,
  brokerStatus,
  onRefresh,
}: BrokerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Broker Integrations & Execution Connectors
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Paper trading and simulated live routing via Alpaca and Coinbase Advanced Trade
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Connector Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Alpaca Equities Connector */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Alpaca Markets</h3>
                    <p className="text-[11px] text-zinc-500">Equities & ETFs (US Stocks)</p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    brokerStatus?.alpaca.isConfigured
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {brokerStatus?.alpaca.isConfigured ? 'API Connected' : 'Paper Sandbox'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-3 dark:bg-zinc-950">
                  <span className="text-[10px] font-semibold text-zinc-400">BUYING POWER</span>
                  <p className="font-mono text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(brokerStatus?.alpaca.buyingPower ?? 100000)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 dark:bg-zinc-950">
                  <span className="text-[10px] font-semibold text-zinc-400">CASH BALANCE</span>
                  <p className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(brokerStatus?.alpaca.cash ?? 25000)}
                  </p>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-zinc-500 space-y-1">
                <p>• Supported orders: Market, Limit, Automated Bracket (SL/TP)</p>
                <p>• Default route: AAPL, NVDA, MSFT, TSLA, SPY, QQQ</p>
              </div>
            </div>

            {/* Coinbase Advanced Trade Crypto Connector */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Coinbase Advanced</h3>
                    <p className="text-[11px] text-zinc-500">Cryptocurrency Spot & Pairs</p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    brokerStatus?.coinbase.isConfigured
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {brokerStatus?.coinbase.isConfigured ? 'API Connected' : 'Crypto Sandbox'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-3 dark:bg-zinc-950">
                  <span className="text-[10px] font-semibold text-zinc-400">PORTFOLIO VALUE</span>
                  <p className="font-mono text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(brokerStatus?.coinbase.portfolioValue ?? 15000)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 dark:bg-zinc-950">
                  <span className="text-[10px] font-semibold text-zinc-400">USD LIQUIDITY</span>
                  <p className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(brokerStatus?.coinbase.cash ?? 15000)}
                  </p>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-zinc-500 space-y-1">
                <p>• Supported orders: Market IOC, Limit GTC, Fractional Sizes</p>
                <p>• Default route: BTC/USD, ETH/USD, SOL/USD, crypto pairs</p>
              </div>
            </div>
          </div>

          {/* Smart Order Router Info */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-zinc-700 dark:text-zinc-300">
            <h4 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Automated Risk Gate & Smart Order Routing
            </h4>
            <p className="mt-1 leading-relaxed">
              When transitioning a Watching setup into a real paper or live trade, Shadow Trader automatically verifies
              the 7-point risk gate checklist (confidence, risk/reward, volume, trend strength, direction, sizing, and cooldown). Passing equity setups are routed
              to Alpaca with bracket stops/targets attached, and crypto setups are routed to Coinbase Advanced Trade with fractional precision.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">
            Configure keys in <code className="font-mono text-[11px]">.env</code>: ALPACA_API_KEY_ID, COINBASE_API_KEY
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
