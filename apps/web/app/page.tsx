

'use client';

import { FormEvent, useState } from 'react';

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
};

type AnalyzeResponse = {
  thesis?: TradingThesis;
  traceId?: string;
  signals?: Array<Record<string, unknown>>;
  quote?: Record<string, unknown>;
  meta?: {
    symbol?: string;
    analyzedAt?: string;
    agentModel?: string;
    agentVersion?: string;
  };
  error?: string;
};

const API_BASE_URL = 'http://localhost:3001';

export default function Home() {
  const [symbol, setSymbol] = useState('AAPL');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanSymbol = symbol.trim().toUpperCase();

    if (!cleanSymbol) {
      setError('Enter a stock symbol first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol,
        }),
      })

      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed with status ${response.status}`);
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const thesis = result?.thesis;
  const confidence = thesis?.confidenceScore;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Shadow Trader
          </p>

          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            AI-powered market thesis generator
          </h1>

          <p className="mt-4 max-w-2xl text-slate-300">
            Enter a ticker symbol and the app will call your Node backend, which then calls your Python ADK agent service.
          </p>

          <form onSubmit={handleAnalyze} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="AAPL"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold uppercase text-white outline-none transition focus:border-cyan-400"
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>

          {error && (
            <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
              {error}
            </div>
          )}
        </section>

        {thesis && (
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
                    Thesis
                  </p>

                  <h2 className="mt-1 text-3xl font-bold">
                    {thesis.symbol ?? result?.meta?.symbol}
                  </h2>
                </div>

                <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200">
                  {thesis.direction ?? 'UNKNOWN'}
                </span>
              </div>

              <p className="mt-6 leading-7 text-slate-200">
                {thesis.thesis}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Confidence"
                  value={typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'N/A'}
                />

                <StatCard
                  label="Action"
                  value={thesis.suggestedAction ?? 'N/A'}
                />

                <StatCard
                  label="Time Horizon"
                  value={thesis.timeHorizon ?? 'N/A'}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
                Trace
              </p>

              <p className="mt-3 break-all rounded-xl bg-slate-950 p-3 text-sm text-slate-300">
                {result?.traceId ?? thesis.traceId ?? 'No trace ID returned'}
              </p>

              <p className="mt-4 text-sm text-slate-400">
                Model: {result?.meta?.agentModel ?? 'Unknown'}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Version: {result?.meta?.agentVersion ?? 'Unknown'}
              </p>
            </div>
          </section>
        )}

        {thesis && (
          <section className="grid gap-6 md:grid-cols-2">
            <FactorList
              title="Bullish Factors"
              factors={thesis.bullishFactors}
            />

            <FactorList
              title="Bearish Factors"
              factors={thesis.bearishFactors}
            />
          </section>
        )}

        {thesis?.riskExplanation && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
            <p className="text-sm font-bold uppercase tracking-[0.25em]">
              Risk Explanation
            </p>

            <p className="mt-3 leading-7">
              {thesis.riskExplanation}
            </p>
          </section>
        )}

        {result && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-400">
              Raw Backend Response
            </p>

            <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function FactorList({
  title,
  factors,
}: {
  title: string;
  factors?: string[];
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-xl font-bold">{title}</h3>

      {factors && factors.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {factors.map((factor, index) => (
            <li
              key={`${factor}-${index}`}
              className="rounded-xl bg-slate-950 p-3 text-slate-300"
            >
              {factor}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-slate-400">
          No factors returned.
        </p>
      )}
    </div>
  );
}