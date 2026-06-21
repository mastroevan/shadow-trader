export const WATCHLIST_STATUSES = [
  "Watching",
  "Triggered",
  "Invalidated",
  "Expired",
] as const;

export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

const SHEETS_DIRECTIONS = new Set(["BEARISH", "BULLISH", "NEUTRAL"]);

export function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeSheetsDirection(value: unknown): string {
  const direction = String(value ?? "").trim().toUpperCase();

  return SHEETS_DIRECTIONS.has(direction) ? direction : "NEUTRAL";
}

export function normalizeSheetsHorizon(value: unknown): string {
  const horizon = String(value ?? "").trim().toUpperCase();

  if (horizon === "SHORT" || horizon === "1D") return "SHORT";
  if (horizon === "MEDIUM") return "MEDIUM";

  return "1W";
}

export function normalizeWatchlistStatus(value: unknown): WatchlistStatus {
  const status = String(value ?? "").trim().toLowerCase();

  return (
    WATCHLIST_STATUSES.find((candidate) => candidate.toLowerCase() === status) ??
    "Watching"
  );
}

export function isWatchlistStatus(value: unknown): value is WatchlistStatus {
  const status = String(value ?? "").trim().toLowerCase();

  return WATCHLIST_STATUSES.some(
    (candidate) => candidate.toLowerCase() === status
  );
}
