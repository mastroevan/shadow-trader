import { SignalDetail } from '../types';

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCurrency(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function compactCurrency(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
}

export function formatNumber(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return value.toFixed(2);
}

export function formatCandleTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value?: string | null): string {
  const date = parseValidDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatDate(value?: string | null): string {
  const date = parseValidDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDate(value?: string | null): string {
  const date = parseValidDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatAnalysisTimeframe(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    '1m': 'Based on 1-minute chart',
    '5m': 'Based on 5-minute chart',
    '15m': 'Based on 15-minute chart',
    '1h': 'Based on 1-hour chart',
    '1d': 'Based on daily chart',
  };

  return labels[normalized] ?? (normalized.includes('based on') ? value : `Based on ${value} chart`);
}

export function formatSignalValue(signal: SignalDetail): string {
  if (typeof signal.value === 'number') {
    if (signal.unit === 'ratio') return `${signal.value.toFixed(2)}x`;
    if (signal.unit === 'score') return signal.value.toFixed(2);
    if (signal.unit === 'price') return formatCurrency(signal.value);
    if (signal.unit === 'percent' || !signal.unit) return `${signal.value.toFixed(2)}%`;

    return String(signal.value);
  }

  return signal.value ? String(signal.value) : 'N/A';
}

export function parseFirstPriceLevel(value?: string): number | null {
  if (!value) return null;

  const matches = Array.from(value.matchAll(/\$?\b\d+(?:,\d{3})*(?:\.\d+)?\b/g));

  for (const match of matches) {
    const raw = match[0];
    const nextCharacter = value[Number(match.index) + raw.length]?.toLowerCase();

    if (nextCharacter === '%' || nextCharacter === 'r' || nextCharacter === 'x') {
      continue;
    }

    const parsed = Number(raw.replace(/[$,]/g, ''));

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}
