import { analyzeSetup, getThesisNumber, getThesisString } from "./setupAnalysis";
import { upsertWatchlistEntry } from "./watchlist";
import type { AssetClass } from "../types/market";

type StartupScanCandidate = {
  symbol: string;
  assetClass: AssetClass;
};

export type StartupScanResult = {
  ranAt: string;
  threshold: number;
  scanned: number;
  added: number;
  skipped: Array<{
    symbol: string;
    confidenceScore: number | null;
    reason: string;
  }>;
  errors: Array<{
    symbol: string;
    message: string;
  }>;
};

let startupScanStarted = false;

const DEFAULT_STOCK_TICKERS = ["NVDA", "AAPL", "MSFT", "TSLA", "META"];
const DEFAULT_CRYPTO_TICKERS = ["BTC/USD", "ETH/USD", "SOL/USD"];

export function startStartupScanner() {
  if (startupScanStarted || !isStartupScanEnabled()) {
    return;
  }

  startupScanStarted = true;
  const candidates = getStartupScanCandidates();

  if (candidates.length === 0) {
    console.log("Startup scanner enabled but no tickers are configured.");
    return;
  }

  setTimeout(() => {
    void runStartupScan().then((result) => {
      console.log("Startup ticker scan completed", {
        scanned: result.scanned,
        added: result.added,
        skipped: result.skipped.length,
        errors: result.errors.length,
      });
    }).catch((error) => {
      console.warn("Startup ticker scan failed:", error);
    });
  }, getStartupScanDelayMs());

  console.log(
    `Startup ticker scan enabled; scanning ${candidates.length} symbols at confidence >= ${formatPercent(getConfidenceThreshold())}.`
  );
}

export async function runStartupScan(): Promise<StartupScanResult> {
  const candidates = getStartupScanCandidates();
  const threshold = getConfidenceThreshold();
  const result: StartupScanResult = {
    ranAt: new Date().toISOString(),
    threshold,
    scanned: candidates.length,
    added: 0,
    skipped: [],
    errors: [],
  };

  for (const candidate of candidates) {
    try {
      const analysis = await analyzeSetup({
        symbol: candidate.symbol,
        assetClass: candidate.assetClass,
        timeframe: process.env.STARTUP_SCAN_TIMEFRAME ?? "5m",
      });
      const confidenceScore = normalizeConfidenceScore(
        getThesisNumber(analysis.thesis, "confidenceScore")
      );

      if (confidenceScore === null || confidenceScore < threshold) {
        result.skipped.push({
          symbol: analysis.meta.symbol,
          confidenceScore,
          reason: "BELOW_CONFIDENCE_THRESHOLD",
        });
        continue;
      }

      await upsertWatchlistEntry({
        symbol: analysis.meta.symbol,
        direction: getThesisString(analysis.thesis, "direction", "NEUTRAL"),
        suggestedAction: getThesisString(analysis.thesis, "suggestedAction", "WATCH"),
        confidenceScore,
        startPrice: analysis.quote.price,
        thesis: getThesisString(analysis.thesis, "thesis", ""),
        entryTrigger: getNestedString(
          analysis.thesis,
          ["tradePlan", "entryTrigger"],
          getDefaultEntryTrigger(analysis.thesis)
        ) ?? getDefaultEntryTrigger(analysis.thesis),
        invalidation: getNestedString(
          analysis.thesis,
          ["tradePlan", "invalidation"],
          getDefaultInvalidation(analysis.thesis)
        ) ?? getDefaultInvalidation(analysis.thesis),
        entryZone: getNestedString(analysis.thesis, ["setup", "entryZone"]),
        stopLossTrigger: getNestedString(analysis.thesis, ["setup", "stopLoss"]),
        takeProfitTrigger: getNestedString(analysis.thesis, ["setup", "takeProfit"]),
        watchConditions: getWatchConditions(analysis.thesis),
        riskExplanation: getThesisString(analysis.thesis, "riskExplanation", ""),
        news: analysis.news.slice(0, 5).map((item) => ({
          headline: item.headline,
          source: item.source,
          url: item.url,
        })),
        traceId: analysis.traceId,
        timeHorizon: getThesisString(analysis.thesis, "timeHorizon", "1W"),
        status: "Watching",
      });

      result.added += 1;
    } catch (error) {
      result.errors.push({
        symbol: candidate.symbol,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

function isStartupScanEnabled() {
  const configured = String(process.env.STARTUP_SCAN_ENABLED ?? "true")
    .trim()
    .toLowerCase();

  return configured !== "false" && configured !== "0" && configured !== "off";
}

function getStartupScanCandidates(): StartupScanCandidate[] {
  const stockTickers = parseTickerList(
    process.env.STARTUP_SCAN_STOCK_TICKERS,
    DEFAULT_STOCK_TICKERS
  ).map((symbol) => ({ symbol, assetClass: "stock" as const }));
  const cryptoTickers = parseTickerList(
    process.env.STARTUP_SCAN_CRYPTO_TICKERS,
    DEFAULT_CRYPTO_TICKERS
  ).map((symbol) => ({ symbol, assetClass: "crypto" as const }));
  const allTickers = parseMixedTickerList(process.env.STARTUP_SCAN_TICKERS);
  const candidates = [...stockTickers, ...cryptoTickers, ...allTickers];
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.assetClass}:${candidate.symbol.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseTickerList(value: string | undefined, fallback: string[]) {
  const source = value === undefined ? fallback.join(",") : value;

  return source
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function parseMixedTickerList(value: string | undefined): StartupScanCandidate[] {
  if (!value) return [];

  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const [maybeAssetClass, maybeSymbol] = raw.split(":").map((part) => part.trim());

      if (maybeSymbol && maybeAssetClass.toLowerCase() === "crypto") {
        return { symbol: maybeSymbol, assetClass: "crypto" as const };
      }

      if (maybeSymbol && ["stock", "stocks", "equity"].includes(maybeAssetClass.toLowerCase())) {
        return { symbol: maybeSymbol, assetClass: "stock" as const };
      }

      return {
        symbol: raw,
        assetClass: raw.includes("/") || raw.includes("-") ? "crypto" : "stock",
      };
    });
}

function getConfidenceThreshold() {
  return normalizeConfidenceScore(Number(process.env.STARTUP_SCAN_MIN_CONFIDENCE)) ?? 0.75;
}

function normalizeConfidenceScore(score: number | null): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score > 1 && score <= 100) return score / 100;

  return score;
}

function getStartupScanDelayMs() {
  const configured = Number(process.env.STARTUP_SCAN_DELAY_MS);

  return Number.isFinite(configured) && configured >= 0 ? configured : 1000;
}

function getNestedString(
  value: unknown,
  path: string[],
  fallback = ""
): string | undefined {
  let current = value;

  for (const segment of path) {
    if (!current || typeof current !== "object") return fallback || undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.trim()
    ? current
    : fallback || undefined;
}

function getWatchConditions(thesis: unknown): string[] {
  const tradePlan = thesis && typeof thesis === "object"
    ? (thesis as Record<string, unknown>).tradePlan
    : null;
  const watchConditions = tradePlan && typeof tradePlan === "object"
    ? (tradePlan as Record<string, unknown>).watchConditions
    : null;

  if (Array.isArray(watchConditions)) {
    return watchConditions.map(String).filter(Boolean).slice(0, 5);
  }

  return [
    "VWAP position remains aligned with the thesis.",
    "Intraday trend confirms the directional call.",
    "Recent headlines do not contradict the setup.",
  ];
}

function getDefaultEntryTrigger(thesis: unknown) {
  const direction = getThesisString(thesis, "direction", "NEUTRAL").toUpperCase();

  return direction.includes("BEAR")
    ? "Watch for continued downside pressure while price remains below VWAP or short-term EMAs."
    : "Watch for price confirmation with follow-through above VWAP or short-term EMAs.";
}

function getDefaultInvalidation(thesis: unknown) {
  const direction = getThesisString(thesis, "direction", "NEUTRAL").toUpperCase();

  return direction.includes("BEAR")
    ? "Reassess if price recovers above VWAP and momentum flips positive."
    : "Reassess if price loses VWAP and intraday momentum flips negative.";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
