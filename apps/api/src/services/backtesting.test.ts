import assert from 'node:assert/strict';
import test from 'node:test';
import { runBacktest, BacktestStrategy } from './backtesting';

test('runBacktest runs BREAKOUT_MOMENTUM simulation and produces metrics', async () => {
  const result = await runBacktest({
    symbol: 'NVDA',
    strategy: 'BREAKOUT_MOMENTUM',
    lookbackDays: 30,
    initialCapital: 10_000,
    riskPerTradePercent: 1.0,
    minRiskReward: 2.0,
  });

  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.strategy, 'BREAKOUT_MOMENTUM');
  assert.equal(result.initialCapital, 10_000);
  assert.ok(result.candleCount >= 30);
  assert.ok(result.equityCurve.length > 0);
  assert.ok(typeof result.winRate === 'number');
  assert.ok(typeof result.profitFactor === 'number');
  assert.ok(typeof result.maxDrawdown === 'number');
  assert.ok(typeof result.sharpeRatio === 'number');
  assert.ok(typeof result.sortinoRatio === 'number');
});

test('runBacktest supports VWAP_PULLBACK and MEAN_REVERSION strategies', async () => {
  const vwapResult = await runBacktest({
    symbol: 'AAPL',
    strategy: 'VWAP_PULLBACK',
    lookbackDays: 30,
  });

  assert.equal(vwapResult.strategy, 'VWAP_PULLBACK');
  assert.ok(vwapResult.equityCurve.length > 0);

  const meanRevResult = await runBacktest({
    symbol: 'BTC/USD',
    strategy: 'MEAN_REVERSION',
    lookbackDays: 30,
  });

  assert.equal(meanRevResult.strategy, 'MEAN_REVERSION');
  assert.ok(meanRevResult.equityCurve.length > 0);
});
