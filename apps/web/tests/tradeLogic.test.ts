import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageNumbers,
  confidenceBucket,
  countBy,
  deriveTradeRiskFields,
  directionClass,
  formatCountMap,
  getConfidencePct,
  getFeaturedSignals,
  getMarketCondition,
  getStrategy,
  getTradePlan,
  getTradingStyle,
  getTriggerType,
  getTrustLedgerInsights,
  getWatchlistDecision,
  isTriggeredReviewStatus,
  watchlistStatusClass,
} from '../app/utils/tradeLogic.ts';
import { LedgerEntry, SavedWatchlistEntry, SignalDetail, TradingThesis } from '../app/types.ts';

describe('tradeLogic', () => {
  describe('getConfidencePct', () => {
    it('rounds decimal confidence to percentage integer', () => {
      assert.equal(getConfidencePct({ confidenceScore: 0.854 }), 85);
      assert.equal(getConfidencePct({ confidenceScore: 0.6 }), 60);
    });

    it('returns null when confidence is absent', () => {
      assert.equal(getConfidencePct({}), null);
      assert.equal(getConfidencePct(undefined), null);
    });
  });

  describe('getWatchlistDecision', () => {
    const dummyEntry: SavedWatchlistEntry = {
      id: '1',
      symbol: 'AAPL',
      direction: 'BULLISH',
      suggestedAction: 'WATCH',
      confidenceScore: 0.8,
      startPrice: 150,
      thesis: 'Test',
      entryTrigger: 'Trigger',
      invalidation: 'Invalid',
      watchConditions: [],
      timeHorizon: '1D',
      status: 'Watching',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: '2026-10-15T00:00:00Z',
    };

    it('returns auto-added for confidence >= 75%', () => {
      assert.equal(getWatchlistDecision(80, null), 'auto-added');
      assert.equal(getWatchlistDecision(75, null), 'auto-added');
    });

    it('returns manual for confidence between 60% and 74%', () => {
      assert.equal(getWatchlistDecision(65, null), 'manual');
      assert.equal(getWatchlistDecision(60, null), 'manual');
    });

    it('returns rejected for confidence below 60%', () => {
      assert.equal(getWatchlistDecision(59, null), 'rejected');
      assert.equal(getWatchlistDecision(40, null), 'rejected');
    });

    it('returns waiting for null confidence when not saved', () => {
      assert.equal(getWatchlistDecision(null, null), 'waiting');
    });

    it('respects savedEntry presence', () => {
      assert.equal(getWatchlistDecision(80, dummyEntry), 'auto-added');
      assert.equal(getWatchlistDecision(65, dummyEntry), 'added');
    });
  });

  describe('getFeaturedSignals', () => {
    it('filters for core indicators', () => {
      const signals: SignalDetail[] = [
        { type: 'INTRADAY_MOMENTUM', label: 'Momentum', value: 0.8 },
        { type: 'CUSTOM_UNKNOWN', label: 'Custom', value: 1.0 },
        { type: 'RSI_14', label: 'RSI', value: 55 },
      ];
      const featured = getFeaturedSignals(signals);
      assert.equal(featured.length, 2);
      assert.equal(featured[0].type, 'INTRADAY_MOMENTUM');
      assert.equal(featured[1].type, 'RSI_14');
    });
  });

  describe('getStrategy and getTradingStyle', () => {
    it('prefers explicit strategy on thesis', () => {
      const thesis: TradingThesis = { strategy: 'VWAP Bounce Strategy' };
      assert.equal(getStrategy(thesis), 'VWAP Bounce Strategy');
    });

    it('infers strategy from setupType when not explicit', () => {
      const thesis: TradingThesis = { setup: { setupType: 'BREAKOUT' } };
      assert.equal(getStrategy(thesis), 'Breakout setup');
    });

    it('infers trading style from hold duration', () => {
      assert.equal(getTradingStyle({ expectedHold: '2-4 hours' }), 'Day Trading');
      assert.equal(getTradingStyle({ expectedHold: '3 days' }), 'Swing');
      assert.equal(getTradingStyle({ tradingStyle: 'Scalping' }), 'Scalping');
    });
  });

  describe('directionClass and watchlistStatusClass', () => {
    it('returns green styling for bullish/long', () => {
      assert.ok(directionClass('BULLISH').includes('emerald'));
      assert.ok(directionClass('LONG').includes('emerald'));
    });

    it('returns red styling for bearish/short', () => {
      assert.ok(directionClass('BEARISH').includes('red'));
      assert.ok(directionClass('SHORT').includes('red'));
    });

    it('identifies triggered review statuses', () => {
      assert.equal(isTriggeredReviewStatus('Triggered Review'), true);
      assert.equal(isTriggeredReviewStatus('Pending Confirmation'), true);
      assert.equal(isTriggeredReviewStatus('Watching'), false);
    });

    it('maps watchlist status classes', () => {
      assert.ok(watchlistStatusClass('Triggered Review').includes('amber'));
      assert.ok(watchlistStatusClass('Triggered').includes('blue'));
      assert.ok(watchlistStatusClass('Invalidated').includes('red'));
    });
  });

  describe('deriveTradeRiskFields', () => {
    it('detects volume confirmation and trend strength', () => {
      const signals: SignalDetail[] = [
        { type: 'VOLUME_SPIKE', value: 1.5 },
        { type: 'INTRADAY_MOMENTUM', value: 1.0 },
        { type: 'VWAP_POSITION', value: 0.8 },
      ];
      const thesis: TradingThesis = {
        setup: { setupType: 'BREAKOUT' },
      };

      const risk = deriveTradeRiskFields(thesis, signals);
      assert.equal(risk.volumeConfirmation, true);
      assert.ok(typeof risk.trendStrength === 'number');
      assert.equal(risk.marketCondition, 'Bullish momentum');
      assert.equal(risk.triggerType, 'BREAKOUT');
    });

    it('flags lack of volume confirmation when volume ratio < 1.2', () => {
      const signals: SignalDetail[] = [{ type: 'VOLUME_SPIKE', value: 0.9 }];
      const risk = deriveTradeRiskFields({}, signals);
      assert.equal(risk.volumeConfirmation, false);
    });
  });

  describe('getTrustLedgerInsights', () => {
    const entries: LedgerEntry[] = [
      {
        id: '1',
        ledgerId: 'l1',
        symbol: 'NVDA',
        direction: 'BULLISH',
        suggestedAction: 'WATCH',
        confidenceScore: 0.8,
        startPrice: 100,
        thesis: 'T1',
        entryTrigger: 'E1',
        invalidation: 'I1',
        watchConditions: [],
        timeHorizon: '1D',
        status: 'Triggered',
        recordType: 'Closed Trade',
        outcome: 'Win',
        profitLoss: 500,
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-10-15T00:00:00Z',
      },
      {
        id: '2',
        ledgerId: 'l2',
        symbol: 'TSLA',
        direction: 'BEARISH',
        suggestedAction: 'WATCH',
        confidenceScore: 0.65,
        startPrice: 200,
        thesis: 'T2',
        entryTrigger: 'E2',
        invalidation: 'I2',
        watchConditions: [],
        timeHorizon: '1D',
        status: 'Triggered',
        recordType: 'Closed Trade',
        outcome: 'Loss',
        profitLoss: -200,
        volumeConfirmation: false,
        riskRewardRatio: 1.5,
        triggerType: 'BREAKOUT',
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-10-15T00:00:00Z',
      },
      {
        id: '3',
        ledgerId: 'l3',
        symbol: 'MSFT',
        direction: 'BULLISH',
        suggestedAction: 'WATCH',
        confidenceScore: 0.7,
        startPrice: 300,
        thesis: 'T3',
        entryTrigger: 'E3',
        invalidation: 'I3',
        watchConditions: [],
        timeHorizon: '1D',
        status: 'Invalidated',
        recordType: 'Invalidated Setup',
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-10-15T00:00:00Z',
      },
    ];

    it('calculates win rate, averages, and loss breakdown', () => {
      const insights = getTrustLedgerInsights(entries);

      assert.equal(insights.totalWins, 1);
      assert.equal(insights.totalLosses, 1);
      assert.equal(insights.winRate, 50.0);
      assert.equal(insights.averageWin, 500);
      assert.equal(insights.averageLoss, -200);
      assert.equal(insights.totalProfitLoss, 300);
      assert.equal(insights.lossesMissingVolume, 1);
      assert.equal(insights.lossesLowRiskReward, 1);
      assert.equal(insights.lossCountByTriggerType['BREAKOUT'], 1);
      assert.equal(insights.lossCountByConfidenceBucket['60-70%'], 1);
      assert.equal(insights.profitFactor, 2.5);
      assert.equal(insights.cumulativePnlCurve.length, 2);
      assert.equal(insights.cumulativePnlCurve[0].cumulativePnl, 500);
      assert.equal(insights.cumulativePnlCurve[1].cumulativePnl, 300);
      assert.equal(insights.maxDrawdown, 200);
      assert.ok(insights.sharpeRatio !== undefined);
      assert.ok(insights.sortinoRatio !== undefined);
    });
  });
});
