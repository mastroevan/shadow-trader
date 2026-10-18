'use client';

import React, { useState } from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Layers, ArrowRight } from 'lucide-react';
import { SetupComparisonResult, ModelComparisonItem } from '../types';
import { API_BASE_URL } from '../constants';

type ModelCompareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  onApplyThesis?: (thesis: any) => void;
};

export function ModelCompareModal({
  isOpen,
  onClose,
  symbol,
  onApplyThesis,
}: ModelCompareModalProps) {
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<SetupComparisonResult | null>(null);
  const [error, setError] = useState('');
  const [selectedTargets, setSelectedTargets] = useState({
    openai: true,
    anthropic: true,
    google: true,
  });

  if (!isOpen) return null;

  async function handleRunComparison() {
    setComparing(true);
    setError('');

    const targets: Array<{ provider: string; model?: string }> = [];
    if (selectedTargets.openai) targets.push({ provider: 'openai', model: 'gpt-4o' });
    if (selectedTargets.anthropic) targets.push({ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' });
    if (selectedTargets.google) targets.push({ provider: 'google', model: 'gemini-2.0-flash' });

    if (targets.length === 0) {
      setError('Please select at least one AI provider model.');
      setComparing(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/setups/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          targets,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Comparison failed with status ${res.status}`);
      }

      const data: SetupComparisonResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run model comparison.');
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Multi-Model Thesis Comparison: <span className="text-emerald-600 dark:text-emerald-400">{symbol}</span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Compare trading theses, setups, and risk factors across OpenAI, Anthropic Claude, and Google Gemini
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
          {/* Target Model Selector Bar */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Select Frontier Models
                </span>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTargets.openai}
                      onChange={(e) => setSelectedTargets((prev) => ({ ...prev, openai: e.target.checked }))}
                      className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>OpenAI GPT-4o</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTargets.anthropic}
                      onChange={(e) => setSelectedTargets((prev) => ({ ...prev, anthropic: e.target.checked }))}
                      className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Claude 3.5 Sonnet</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTargets.google}
                      onChange={(e) => setSelectedTargets((prev) => ({ ...prev, google: e.target.checked }))}
                      className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Gemini 2.0 Flash</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunComparison}
                disabled={comparing}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {comparing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Analyzing Across Providers...</span>
                  </>
                ) : (
                  <>
                    <Layers className="h-4 w-4" />
                    <span>Compare Theses</span>
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Consensus Overview Card */}
          {result && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 dark:border-emerald-500/20">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Consensus Decision
                  </span>
                  <div className="mt-1 flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold ${
                        result.consensus.majorityBias === 'LONG'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : result.consensus.majorityBias === 'SHORT'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {result.consensus.majorityBias === 'LONG' ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : result.consensus.majorityBias === 'SHORT' ? (
                        <TrendingDown className="h-4 w-4" />
                      ) : null}
                      Majority {result.consensus.majorityBias} ({result.consensus.majorityDirection})
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        result.consensus.agreementScore >= 0.8
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-900'
                          : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:border-amber-900'
                      }`}
                    >
                      {Math.round(result.consensus.agreementScore * 100)}% Agreement
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Models Compared</p>
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {result.consensus.modelsCompared}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Average Confidence</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.round(result.consensus.averageConfidence * 100)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Model Comparison Columns */}
          {result && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.comparisons.map((item: ModelComparisonItem, idx: number) => {
                const thesis = item.thesis;
                const setup = (thesis as any)?.setup;
                const tradePlan = (thesis as any)?.tradePlan;
                const bias = setup?.bias || (thesis?.direction === 'BEARISH' ? 'SHORT' : 'LONG');
                const confidencePct = thesis?.confidenceScore
                  ? Math.round(Number(thesis.confidenceScore) * 100)
                  : null;

                const providerLabel =
                  item.provider === 'openai'
                    ? 'OpenAI'
                    : item.provider === 'anthropic'
                      ? 'Anthropic'
                      : 'Google';

                const providerBadgeClass =
                  item.provider === 'openai'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : item.provider === 'anthropic'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

                return (
                  <div
                    key={`${item.provider}-${idx}`}
                    className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60"
                  >
                    <div>
                      {/* Provider Header */}
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800/80">
                        <div>
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${providerBadgeClass}`}>
                            {providerLabel}
                          </span>
                          <h4 className="mt-1 font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {item.model}
                          </h4>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                            bias === 'LONG'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : bias === 'SHORT'
                                ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {bias}
                        </span>
                      </div>

                      {/* Confidence Meter */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-zinc-500">Confidence</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {confidencePct !== null ? `${confidencePct}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${confidencePct ?? 50}%` }}
                          />
                        </div>
                      </div>

                      {/* Thesis */}
                      <p className="mt-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 line-clamp-4">
                        {thesis?.thesis || 'No thesis generated.'}
                      </p>

                      {/* Setup Grid */}
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                          <span className="text-[10px] font-semibold text-zinc-400">STOP LOSS</span>
                          <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {setup?.stopLoss || 'N/A'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                          <span className="text-[10px] font-semibold text-zinc-400">TAKE PROFIT</span>
                          <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {setup?.takeProfit || 'N/A'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                          <span className="text-[10px] font-semibold text-zinc-400">R:R RATIO</span>
                          <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {setup?.riskReward || '2.0:1'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                          <span className="text-[10px] font-semibold text-zinc-400">TRIGGER</span>
                          <p className="truncate font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {tradePlan?.entryTrigger || setup?.setupType || 'Momentum'}
                          </p>
                        </div>
                      </div>

                      {/* Bullish & Bearish Factors */}
                      {thesis?.bullishFactors && thesis.bullishFactors.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">Bullish Factor</span>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">
                            • {thesis.bullishFactors[0]}
                          </p>
                        </div>
                      )}
                      {thesis?.bearishFactors && thesis.bearishFactors.length > 0 && (
                        <div className="mt-1 space-y-1">
                          <span className="text-[10px] font-bold text-red-500 uppercase">Risk Factor</span>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">
                            • {thesis.bearishFactors[0]}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Apply Button */}
                    {onApplyThesis && thesis && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyThesis(thesis);
                          onClose();
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white py-1.5 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                      >
                        <span>Apply to Desk</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!result && !comparing && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Ready to compare theses for {symbol}
              </p>
              <p className="mt-1 text-xs text-zinc-400 max-w-md">
                Click &quot;Compare Theses&quot; to prompt OpenAI, Anthropic Claude, and Google Gemini simultaneously to cross-validate direction, triggers, and invalidation rules.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
