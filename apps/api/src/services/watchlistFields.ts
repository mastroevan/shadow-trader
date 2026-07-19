export const WATCHLIST_STATUSES = [
  "Watching",
  "Triggered Review",
  "Pending Confirmation",
  "Triggered",
  "Invalidated",
  "Expired",
] as const;

export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

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

export function normalizeTimeHorizon(value: unknown): string {
  const horizon = String(value ?? "").trim().toUpperCase();

  if (horizon === "SHORT" || horizon === "1D") return "SHORT";
  if (horizon === "MEDIUM") return "MEDIUM";

  return "1W";
}

export function normalizeWatchlistStatus(value: unknown): WatchlistStatus {
  const status = String(value ?? "").trim().toLowerCase();

  if (status === "pending confirmation") return "Triggered Review";

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
