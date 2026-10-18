import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactCurrency,
  formatAnalysisTimeframe,
  formatCandleTime,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSignalValue,
  formatTime,
  parseFirstPriceLevel,
  titleCase,
} from '../app/utils/formatters';

describe('formatters', () => {
  describe('titleCase', () => {
    it('converts underscore-separated words to Title Case', () => {
      assert.equal(titleCase('INTRADAY_MOMENTUM'), 'Intraday Momentum');
      assert.equal(titleCase('breakout_setup'), 'Breakout Setup');
    });

    it('converts single words', () => {
      assert.equal(titleCase('crypto'), 'Crypto');
      assert.equal(titleCase('STOCK'), 'Stock');
    });
  });

  describe('formatCurrency', () => {
    it('formats numbers as USD currency', () => {
      assert.equal(formatCurrency(1234.56), '$1,234.56');
      assert.equal(formatCurrency(0), '$0.00');
      assert.equal(formatCurrency(99.9), '$99.90');
    });

    it('returns N/A for null, undefined, or NaN', () => {
      assert.equal(formatCurrency(undefined), 'N/A');
      assert.equal(formatCurrency(null), 'N/A');
      assert.equal(formatCurrency(Number.NaN), 'N/A');
    });
  });

  describe('compactCurrency', () => {
    it('formats numbers compactly', () => {
      assert.equal(compactCurrency(10_000), '$10K');
      assert.equal(compactCurrency(1_500_000), '$1.5M');
    });

    it('returns N/A for null or undefined', () => {
      assert.equal(compactCurrency(undefined), 'N/A');
      assert.equal(compactCurrency(null), 'N/A');
    });
  });

  describe('formatPercent', () => {
    it('multiplies ratio by 100 and appends %', () => {
      assert.equal(formatPercent(0.0525), '5.25%');
      assert.equal(formatPercent(-0.012), '-1.20%');
      assert.equal(formatPercent(0), '0.00%');
    });

    it('returns N/A for null or undefined', () => {
      assert.equal(formatPercent(null), 'N/A');
      assert.equal(formatPercent(undefined), 'N/A');
    });
  });

  describe('formatNumber', () => {
    it('formats numbers to 2 decimal places', () => {
      assert.equal(formatNumber(3.14159), '3.14');
      assert.equal(formatNumber(2), '2.00');
    });

    it('returns N/A for null or undefined', () => {
      assert.equal(formatNumber(null), 'N/A');
      assert.equal(formatNumber(undefined), 'N/A');
    });
  });

  describe('formatCandleTime', () => {
    it('formats unix timestamp to a time string', () => {
      const formatted = formatCandleTime(1700000000);
      assert.match(formatted, /\d{1,2}:\d{2}\s?(AM|PM)/i);
    });
  });

  describe('formatTime, formatDate, formatShortDate', () => {
    const iso = '2026-10-15T14:30:00.000Z';

    it('formats time from ISO string', () => {
      const time = formatTime(iso);
      assert.notEqual(time, 'N/A');
      assert.equal(formatTime(null), 'N/A');
      assert.equal(formatTime(undefined), 'N/A');
    });

    it('formats date from ISO string', () => {
      const date = formatDate(iso);
      assert.notEqual(date, 'N/A');
      assert.equal(formatDate(null), 'N/A');
    });

    it('formats short date from ISO string', () => {
      const shortDate = formatShortDate(iso);
      assert.notEqual(shortDate, 'N/A');
      assert.equal(formatShortDate(null), 'N/A');
    });
  });

  describe('formatAnalysisTimeframe', () => {
    it('maps timeframe codes to descriptive labels', () => {
      assert.equal(formatAnalysisTimeframe('1m'), 'Based on 1-minute chart');
      assert.equal(formatAnalysisTimeframe('5m'), 'Based on 5-minute chart');
      assert.equal(formatAnalysisTimeframe('15m'), 'Based on 15-minute chart');
      assert.equal(formatAnalysisTimeframe('1h'), 'Based on 1-hour chart');
      assert.equal(formatAnalysisTimeframe('1d'), 'Based on daily chart');
    });

    it('handles custom or already formatted labels', () => {
      assert.equal(formatAnalysisTimeframe('Based on 4-hour chart'), 'Based on 4-hour chart');
      assert.equal(formatAnalysisTimeframe('4h'), 'Based on 4h chart');
    });
  });

  describe('formatSignalValue', () => {
    it('formats ratio signals with x suffix', () => {
      assert.equal(formatSignalValue({ value: 1.85, unit: 'ratio' }), '1.85x');
    });

    it('formats score signals to 2 decimal places', () => {
      assert.equal(formatSignalValue({ value: 0.723, unit: 'score' }), '0.72');
    });

    it('formats price signals as currency', () => {
      assert.equal(formatSignalValue({ value: 450.2, unit: 'price' }), '$450.20');
    });

    it('formats percent signals with % suffix', () => {
      assert.equal(formatSignalValue({ value: 3.5, unit: 'percent' }), '3.50%');
    });

    it('returns string or N/A for non-numbers', () => {
      assert.equal(formatSignalValue({ value: 'BULLISH' }), 'BULLISH');
      assert.equal(formatSignalValue({ value: undefined }), 'N/A');
    });
  });

  describe('parseFirstPriceLevel', () => {
    it('extracts dollar price levels', () => {
      assert.equal(parseFirstPriceLevel('$125.50'), 125.5);
      assert.equal(parseFirstPriceLevel('Target at $2,450.00'), 2450.0);
    });

    it('extracts unadorned price levels', () => {
      assert.equal(parseFirstPriceLevel('Entry near 85.25 zone'), 85.25);
    });

    it('ignores percentages and R-multiples', () => {
      assert.equal(parseFirstPriceLevel('5% drop down to $45.00'), 45.0);
      assert.equal(parseFirstPriceLevel('Target 2R at $150'), 150);
      assert.equal(parseFirstPriceLevel('3x leverage on $500'), 500);
    });

    it('returns null for empty or invalid text', () => {
      assert.equal(parseFirstPriceLevel(undefined), null);
      assert.equal(parseFirstPriceLevel(''), null);
      assert.equal(parseFirstPriceLevel('no prices here'), null);
    });
  });
});
