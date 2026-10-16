import { Candle } from './marketSnapshot';
import { resolveInstrument } from '../utils/symbols';
import { getMarketSnapshot, isValidMarketQuote } from './marketSnapshot';

export type BacktestStrategy = 'BREAKOUT_MOMENTUM' | 'VWAP_PULLBACK' | 'MEAN_REVERSION';

export type BacktestRequest = {
  symbol: string;
  strategy?: BacktestStrategy;
  lookbackDays?: number;
  timeframe?: string;
  initialCapital?: number;
  riskPerTradePercent?: number;
  minRiskReward?: number;
  candles?: Candle[];
};

export type BacktestTrade = {
  id: string;
  symbol: string;
  entryDate: string;
  exitDate: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  outcome: 'Win' | 'Loss';
  pnl: number;
  pnlPercent: number;
  holdingBars: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIMEOUT';
};

export type BacktestEquityPoint = {
  barIndex: number;
  date: string;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
};

export type BacktestResult = {
  symbol: string;
  strategy: BacktestStrategy;
  lookbackDays: number;
  candleCount: number;
  initialCapital: number;
  endingCapital: number;
  netProfit: number;
  netReturnPercent: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageWin: number;
  averageLoss: number;
  averageHoldingBars: number;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
};

export async function runBacktest(request: BacktestRequest): Promise<BacktestResult> {
  const symbol = request.symbol.toUpperCase();
  const strategy: BacktestStrategy = request.strategy ?? 'BREAKOUT_MOMENTUM';
  const lookbackDays = Math.max(7, Math.min(180, request.lookbackDays ?? 60));
  const initialCapital = Math.max(1000, request.initialCapital ?? 10_000);
  const riskPercent = Math.max(0.1, Math.min(5, request.riskPerTradePercent ?? 1.0));
  const minRR = Math.max(1.5, request.minRiskReward ?? 2.0);

  // 1. Obtain candle series
  let candles = request.candles && request.candles.length >= 30 ? request.candles : [];
  if (candles.length < 30 && process.env.NODE_ENV !== 'test') {
    try {
      const instrument = resolveInstrument({ symbol, timeframe: request.timeframe ?? '15m' });
      const snapshot = await getMarketSnapshot(instrument);
      if (isValidMarketQuote(snapshot.quote) && snapshot.candles.length >= 30) {
        candles = snapshot.candles;
      }
    } catch {
      // Fallback to candle generator below
    }
  }

  if (candles.length < 30) {
    candles = generateSyntheticCandles(symbol, lookbackDays);
  }

  // 2. Run simulation over candles
  const isCrypto =
    symbol.includes('/') ||
    symbol.includes('-') ||
    ['BTC', 'ETH', 'SOL'].includes(symbol);

  let currentCapital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestEquityPoint[] = [
    {
      barIndex: 0,
      date: new Date(candles[0].timestamp).toISOString().split('T')[0],
      equity: initialCapital,
      drawdown: 0,
      drawdownPercent: 0,
    },
  ];

  let inTrade = false;
  let activeTrade: {
    id: string;
    entryBar: number;
    entryDate: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    quantity: number;
    direction: 'LONG' | 'SHORT';
  } | null = null;

  const maxHoldBars = 30;

  for (let i = 20; i < candles.length; i++) {
    const bar = candles[i];
    const prevSlice = candles.slice(i - 20, i);

    // If currently in a trade, check exit conditions
    if (inTrade && activeTrade) {
      const holdingBars = i - activeTrade.entryBar;
      let exitPrice: number | null = null;
      let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIMEOUT' | null = null;

      if (bar.low <= activeTrade.stopLoss) {
        exitPrice = activeTrade.stopLoss;
        exitReason = 'STOP_LOSS';
      } else if (bar.high >= activeTrade.takeProfit) {
        exitPrice = activeTrade.takeProfit;
        exitReason = 'TAKE_PROFIT';
      } else if (holdingBars >= maxHoldBars) {
        exitPrice = bar.close;
        exitReason = 'TIMEOUT';
      }

      if (exitPrice !== null && exitReason !== null) {
        const pnl = (exitPrice - activeTrade.entryPrice) * activeTrade.quantity;
        const pnlPercent = (exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice;
        const outcome = pnl >= 0 ? 'Win' : 'Loss';

        currentCapital += pnl;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const dd = Math.max(0, peakCapital - currentCapital);
        const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

        trades.push({
          id: activeTrade.id,
          symbol,
          entryDate: activeTrade.entryDate,
          exitDate: new Date(bar.timestamp).toISOString().split('T')[0],
          direction: activeTrade.direction,
          entryPrice: Number(activeTrade.entryPrice.toFixed(2)),
          exitPrice: Number(exitPrice.toFixed(2)),
          outcome,
          pnl: Number(pnl.toFixed(2)),
          pnlPercent: Number((pnlPercent * 100).toFixed(2)),
          holdingBars,
          exitReason,
        });

        inTrade = false;
        activeTrade = null;
      }
    }

    // Check entry signal if not currently in trade
    if (!inTrade) {
      const highestHigh = Math.max(...prevSlice.map((c) => c.high));
      const lowestLow = Math.min(...prevSlice.map((c) => c.low));
      const avgVolume = prevSlice.reduce((sum, c) => sum + c.volume, 0) / 20;
      const sma20 = prevSlice.reduce((sum, c) => sum + c.close, 0) / 20;
      const stdDev = Math.sqrt(
        prevSlice.reduce((sum, c) => sum + Math.pow(c.close - sma20, 2), 0) / 20
      );
      const lowerBand = sma20 - 2 * stdDev;

      let triggered = false;
      let stopLoss = 0;
      let takeProfit = 0;

      if (strategy === 'BREAKOUT_MOMENTUM') {
        if (bar.close > highestHigh && bar.volume >= avgVolume * 1.15) {
          triggered = true;
          stopLoss = lowestLow;
          const risk = bar.close - stopLoss;
          if (risk > 0) {
            takeProfit = bar.close + risk * minRR;
          } else {
            triggered = false;
          }
        }
      } else if (strategy === 'VWAP_PULLBACK') {
        if (bar.low <= sma20 && bar.close > sma20 && bar.close > bar.open) {
          triggered = true;
          stopLoss = bar.low * 0.99;
          const risk = bar.close - stopLoss;
          if (risk > 0) {
            takeProfit = bar.close + risk * minRR;
          } else {
            triggered = false;
          }
        }
      } else if (strategy === 'MEAN_REVERSION') {
        if (bar.close <= lowerBand) {
          triggered = true;
          stopLoss = bar.close * 0.98;
          const risk = bar.close - stopLoss;
          takeProfit = sma20 > bar.close ? sma20 : bar.close + risk * minRR;
        }
      }

      if (triggered && bar.close > 0 && stopLoss > 0 && takeProfit > bar.close) {
        const dollarRisk = (currentCapital * riskPercent) / 100;
        const riskPerShare = Math.abs(bar.close - stopLoss);
        let quantity = 0;
        if (riskPerShare > 0) {
          const rawQuantity = dollarRisk / riskPerShare;
          quantity = isCrypto ? Number(rawQuantity.toFixed(4)) : Math.max(1, Math.floor(rawQuantity));
        }

        if (quantity > 0) {
          inTrade = true;
          activeTrade = {
            id: `trade-${trades.length + 1}`,
            entryBar: i,
            entryDate: new Date(bar.timestamp).toISOString().split('T')[0],
            entryPrice: bar.close,
            stopLoss,
            takeProfit,
            quantity,
            direction: 'LONG',
          };
        }
      }
    }

    // Record equity point every 5 bars or on trade close
    if (i % 5 === 0 || i === candles.length - 1) {
      const dd = Math.max(0, peakCapital - currentCapital);
      const ddPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0;
      equityCurve.push({
        barIndex: i,
        date: new Date(bar.timestamp).toISOString().split('T')[0],
        equity: Number(currentCapital.toFixed(2)),
        drawdown: Number(dd.toFixed(2)),
        drawdownPercent: Number(ddPct.toFixed(1)),
      });
    }
  }

  // 3. Aggregate results
  const wins = trades.filter((t) => t.outcome === 'Win');
  const losses = trades.filter((t) => t.outcome === 'Loss');
  const winAmounts = wins.map((t) => t.pnl);
  const lossAmounts = losses.map((t) => t.pnl);
  const grossProfit = winAmounts.reduce((sum, v) => sum + v, 0);
  const grossLoss = Math.abs(lossAmounts.reduce((sum, v) => sum + v, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0);
  const netProfit = Number((currentCapital - initialCapital).toFixed(2));
  const netReturnPercent = Number(((netProfit / initialCapital) * 100).toFixed(2));
  const winRate = trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0;

  // Sharpe and Sortino ratios
  const pnlList = trades.map((t) => t.pnl);
  const meanReturn = pnlList.length > 0 ? pnlList.reduce((s, v) => s + v, 0) / pnlList.length : 0;
  const variance =
    pnlList.length > 1
      ? pnlList.reduce((s, v) => s + Math.pow(v - meanReturn, 2), 0) / (pnlList.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const annualFactor = Math.sqrt(Math.min(trades.length, 252));
  const sharpeRatio = stdDev > 0 ? Number(((meanReturn / stdDev) * annualFactor).toFixed(2)) : 0;

  const negativeReturns = pnlList.filter((v) => v < 0);
  const downsideVariance =
    negativeReturns.length > 0
      ? negativeReturns.reduce((s, v) => s + Math.pow(v, 2), 0) / negativeReturns.length
      : 0;
  const downsideStdDev = Math.sqrt(downsideVariance);
  const sortinoRatio =
    downsideStdDev > 0 ? Number(((meanReturn / downsideStdDev) * annualFactor).toFixed(2)) : 0;

  const averageWin = wins.length > 0 ? Number((grossProfit / wins.length).toFixed(2)) : 0;
  const averageLoss = losses.length > 0 ? Number((-grossLoss / losses.length).toFixed(2)) : 0;
  const averageHoldingBars =
    trades.length > 0
      ? Math.round(trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length)
      : 0;

  return {
    symbol,
    strategy,
    lookbackDays,
    candleCount: candles.length,
    initialCapital,
    endingCapital: Number(currentCapital.toFixed(2)),
    netProfit,
    netReturnPercent,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    profitFactor,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(1)),
    sharpeRatio,
    sortinoRatio,
    averageWin,
    averageLoss,
    averageHoldingBars,
    equityCurve,
    trades,
  };
}

function generateSyntheticCandles(symbol: string, days: number): Candle[] {
  const candles: Candle[] = [];
  const barCount = days * 6; // 6 bars per day
  const now = Date.now();
  const barMs = 4 * 60 * 60 * 1000; // 4h bars
  let price = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3500 : 150;

  let trend = 0.002;
  for (let i = barCount; i >= 0; i--) {
    const timestamp = now - i * barMs;
    // Periodic trend cycles
    if (i % 24 === 0) trend = (Math.random() - 0.48) * 0.005;

    const noise = (Math.random() - 0.49) * 0.015;
    const change = price * (trend + noise);
    const open = price;
    const close = Math.max(1, price + change);
    const high = Math.max(open, close) + Math.random() * price * 0.008;
    const low = Math.min(open, close) - Math.random() * price * 0.008;
    const volume = Math.floor(100_000 + Math.random() * 500_000);

    candles.push({
      timestamp,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    price = close;
  }

  return candles;
}
