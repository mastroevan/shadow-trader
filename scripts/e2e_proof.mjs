import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
const symbol = process.env.PROOF_SYMBOL ?? "NVDA";
const shouldWrite = process.argv.includes("--write");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SHADOW_TRADER_API_KEY
        ? { Authorization: `Bearer ${process.env.SHADOW_TRADER_API_KEY}` }
        : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${route} returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`${route} failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function buildWatchlistPayload(result) {
  const thesis = result.thesis ?? {};
  const tradePlan = thesis.tradePlan ?? {};

  return {
    symbol: result.meta?.symbol ?? thesis.symbol ?? symbol,
    direction: thesis.direction ?? "NEUTRAL",
    suggestedAction: thesis.suggestedAction ?? "WATCH",
    confidenceScore:
      typeof thesis.confidenceScore === "number" ? thesis.confidenceScore : null,
    startPrice:
      typeof result.quote?.price === "number"
        ? result.quote.price
        : typeof result.thesisRecord?.initialPrice === "number"
          ? result.thesisRecord.initialPrice
          : null,
    thesis: thesis.thesis ?? "",
    entryTrigger: tradePlan.entryTrigger ?? "Watch for signal confirmation.",
    invalidation: tradePlan.invalidation ?? "Reassess if the thesis breaks.",
    timeHorizon: thesis.timeHorizon ?? "1W",
    watchConditions: Array.isArray(tradePlan.watchConditions)
      ? tradePlan.watchConditions.slice(0, 5)
      : [],
    traceId: result.traceId ?? thesis.traceId,
  };
}

const startedAt = new Date().toISOString();

const health = await requestJson("/health");
const analysis = await requestJson("/api/setups/analyze", {
  method: "POST",
  body: JSON.stringify({ symbol }),
});

assert(health.status === "ok", "API health check did not return ok.");
assert(analysis.agentStatus === "AI_AGENT", "Gemini agent did not complete; fallback was used.");
assert(analysis.quote?.source === "finnhub", "Quote source was not Finnhub.");
assert(Number(analysis.quote?.price) > 0, "Quote price was not populated.");
assert(Array.isArray(analysis.news) && analysis.news.length > 0, "No news headlines were returned.");
assert(typeof analysis.traceId === "string" && analysis.traceId.length > 0, "Trace ID was not returned.");
assert(analysis.thesisRecordId, "Thesis record was not persisted.");

const watchlist = await requestJson("/api/watchlist", {
  method: "POST",
  body: JSON.stringify(buildWatchlistPayload(analysis)),
});

assert(watchlist.entry?.id, "Watchlist entry was not saved.");
assert(watchlist.entry?.traceId === analysis.traceId, "Watchlist entry did not preserve trace ID.");
assert(
  watchlist.entry?.startPrice === analysis.quote.price,
  "Watchlist entry did not preserve start price."
);
assert(
  ["SHORT", "MEDIUM", "1W"].includes(watchlist.entry?.timeHorizon),
  "Watchlist entry did not preserve an expected horizon."
);
assert(
  watchlist.entry?.status === "Watching",
  "Watchlist entry did not use the expected status."
);

const proof = {
  startedAt,
  completedAt: new Date().toISOString(),
  apiBaseUrl,
  symbol,
  health,
  analysis: {
    agentStatus: analysis.agentStatus,
    traceId: analysis.traceId,
    thesisRecordId: analysis.thesisRecordId,
    quote: {
      source: analysis.quote.source,
      symbol: analysis.quote.symbol,
      price: analysis.quote.price,
      previousClose: analysis.quote.previousClose,
      timestamp: analysis.quote.timestamp,
    },
    newsCount: analysis.news.length,
    firstHeadline: analysis.news[0]?.headline,
    thesisDirection: analysis.thesis?.direction,
    suggestedAction: analysis.thesis?.suggestedAction,
    confidenceScore: analysis.thesis?.confidenceScore,
  },
  watchlist: {
    id: watchlist.entry.id,
    symbol: watchlist.entry.symbol,
    traceId: watchlist.entry.traceId,
    startPrice: watchlist.entry.startPrice,
    timeHorizon: watchlist.entry.timeHorizon,
    status: watchlist.entry.status,
  },
};

if (shouldWrite) {
  const proofDir = path.join(process.cwd(), "docs", "proof");
  await mkdir(proofDir, { recursive: true });
  await writeFile(
    path.join(proofDir, "latest-e2e-proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`
  );
}

console.log(JSON.stringify(proof, null, 2));
