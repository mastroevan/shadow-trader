// apps/api/src/routes/setups.ts

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getMarketSnapshot, isValidMarketQuote } from "../services/marketSnapshot";
import { resolveInstrument, getAliasSuggestion } from "../utils/symbols";
import { generateSignals } from "../utils/signals";
import { traceAgentCall } from "../services/arizeTracker";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { createThesisRecord } from "../services/theses";
import type { Instrument, MarketNewsItem, MarketQuote, MarketSnapshot, TechnicalIndicators } from "../types/market";

const router = Router();

const AGENT_URL =
  process.env.AGENT_URL ?? "http://localhost:8000/analyze";
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 65000);

router.post("/market/snapshot", async (req, res) => {
  try {
    const originalInput = String(req.body.symbol ?? "").trim();

    if (!originalInput) {
      return res.status(400).json({
        error: "MISSING_SYMBOL",
        message: "Please enter a symbol.",
      });
    }

    const instrument = resolveInstrument({
      symbol: originalInput,
      assetClass: req.body.assetClass,
      exchange: req.body.exchange,
      timeframe: req.body.timeframe,
    });
    const snapshot = await getMarketSnapshot(instrument);

    if (!isValidMarketQuote(snapshot.quote)) {
      return res.status(400).json({
        error: "NO_QUOTE_FOUND",
        message: `No quote found for ${originalInput}.`,
        originalInput,
        instrument,
        quote: snapshot.quote,
      });
    }

    return res.json({
      quote: snapshot.quote,
      candles: snapshot.candles,
      technicals: snapshot.technicals,
      meta: {
        symbol: instrument.displaySymbol || instrument.symbol,
        instrument,
        originalInput,
        refreshedAt: new Date().toISOString(),
        quoteSource: snapshot.quote.source,
        candleCount: snapshot.candles.length,
      },
    });
  } catch (error) {
    console.error("Market snapshot route failed:", error);

    return res.status(500).json({
      error: "MARKET_SNAPSHOT_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unknown market snapshot route error",
    });
  }
});

router.post("/setups/analyze", async (req, res) => {
  try {
    const originalInput = String(req.body.symbol ?? "").trim();

    if (!originalInput) {
      return res.status(400).json({
        error: "MISSING_SYMBOL",
        message: "Please enter a ticker symbol.",
      });
    }

    const instrument = resolveInstrument({
      symbol: originalInput,
      assetClass: req.body.assetClass,
      exchange: req.body.exchange,
      timeframe: req.body.timeframe,
    });
    const snapshot = await getMarketSnapshot(instrument);
    const { quote, candles, news, technicals } = snapshot;
    const symbol = instrument.displaySymbol || instrument.symbol;

    if (!isValidMarketQuote(quote)) {
      const suggestion = getAliasSuggestion(originalInput);

      return res.status(400).json({
        error: "NO_QUOTE_FOUND",
        message: suggestion
          ? `No quote found for ${originalInput}. Did you mean ${suggestion}?`
          : `No quote found for ${originalInput}. Try NVDA, AAPL, BTC, BTC/USD, or ETH-USD.`,
        originalInput,
        symbol: instrument.symbol,
        instrument,
        suggestion,
        quote,
      });
    }

    const signals = generateSignals({
      instrument,
      quote,
      candles,
      news,
    });

    const newsSignals = news.slice(0, 5).map((item) => {
      return `News headline from ${item.source}: ${item.headline}. ${item.summary}`;
    });

    const signalStrings = [
      ...signals.map((signal) => {
        return `${signal.label}: ${signal.value}. ${signal.interpretation}`;
      }),
      ...newsSignals,
    ];
    const agentPayload = {
      symbol,
      originalInput,
      instrument,
      quote,
      candles,
      signals: signalStrings,
      signalDetails: signals,
      news,
      news_context: newsSignals.join("\n"),
    };

    const { thesis, traceId, agentStatus } = await getAgentThesis({
      symbol,
      instrument,
      quote,
      candles,
      signals,
      signalStrings,
      news,
      technicals,
      agentPayload,
    });

    const thesisRecord = await createThesisRecord({
      symbol,
      direction: getThesisString(thesis, "direction", "NEUTRAL"),
      suggestedAction: getThesisString(thesis, "suggestedAction", "WATCH"),
      confidenceScore: getThesisNumber(thesis, "confidenceScore"),
      thesis,
      evidence: {
        quote,
        candles,
        signals: signalStrings,
        signalDetails: signals,
        news,
        technicals,
      },
      traceId,
      initialPrice: quote.price,
      timeHorizon: getThesisString(thesis, "timeHorizon", "1W"),
    });

    return res.json({
      thesis,
      traceId,
      thesisRecord,
      thesisRecordId: thesisRecord.id,
      agentStatus,
      quote,
      candles,
      signals: signalStrings,
      signalDetails: signals,
      news,
      technicals,
      meta: {
        symbol,
        instrument,
        originalInput,
        analyzedAt: new Date().toISOString(),
        quoteSource: quote.source,
        candleCount: candles.length,
      },
    });
  } catch (error) {
    console.error("Setup analyze route failed:", error);

    return res.status(500).json({
      error: "SETUP_ANALYZE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unknown setup analyze route error",
    });
  }
});

type AgentThesisInput = {
  symbol: string;
  instrument: Instrument;
  quote: MarketQuote;
  candles: MarketSnapshot["candles"];
  signals: ReturnType<typeof generateSignals>;
  signalStrings: string[];
  news: MarketNewsItem[];
  technicals: TechnicalIndicators | null;
  agentPayload: Record<string, unknown>;
};

async function getAgentThesis(input: AgentThesisInput): Promise<{
  thesis: Record<string, unknown>;
  traceId: string;
  agentStatus: "AI_AGENT" | "RULE_BASED_FALLBACK";
}> {
  try {
    const { result: thesis, traceId } = await traceAgentCall(
      "shadow_trader.setups.analyze",
      {
        symbol: input.symbol,
        assetClass: input.instrument.assetClass,
        exchange: input.instrument.exchange ?? "unknown",
        signalCount: input.signalStrings.length,
        candleCount: input.candles.length,
        newsCount: input.news.length,
        quoteSource: input.quote.source ?? "unknown",
        sma20: input.technicals?.sma20,
      },
      async () => {
        const agentResponse = await fetchWithTimeout(
          AGENT_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(input.agentPayload),
          },
          getSafeAgentTimeout()
        );

        if (!agentResponse.ok) {
          const errorText = await agentResponse.text();

          throw new Error(
            `The agent service failed to analyze the symbol. Status ${agentResponse.status}: ${errorText}`
          );
        }

        return (await agentResponse.json()) as Record<string, unknown> & {
          traceId?: string;
        };
      }
    );

    return {
      thesis,
      traceId,
      agentStatus: "AI_AGENT",
    };
  } catch (error) {
    console.warn("Agent thesis failed; using rule-based fallback:", error);

    const traceId = `fallback-${randomUUID()}`;

    return {
      thesis: buildFallbackThesis(input, traceId),
      traceId,
      agentStatus: "RULE_BASED_FALLBACK",
    };
  }
}

function getSafeAgentTimeout() {
  return Number.isFinite(AGENT_TIMEOUT_MS) && AGENT_TIMEOUT_MS >= 5000
    ? AGENT_TIMEOUT_MS
    : 20000;
}

function buildFallbackThesis(input: AgentThesisInput, traceId: string) {
  const priceChangePct =
    input.quote.price > 0 && input.quote.previousClose > 0
      ? ((input.quote.price - input.quote.previousClose) / input.quote.previousClose) * 100
      : 0;
  const vwapSignal = input.signals.find((signal) => signal.type === "VWAP_POSITION");
  const emaSignal = input.signals.find((signal) => signal.type === "EMA_ALIGNMENT");
  const momentumSignal = input.signals.find((signal) => signal.type === "INTRADAY_MOMENTUM");
  const newsSentiment = input.signals.find((signal) => signal.type === "NEWS_SENTIMENT");
  const direction =
    priceChangePct > 1
      ? "BULLISH"
      : priceChangePct < -1
        ? "BEARISH"
        : "NEUTRAL";
  const suggestedAction = direction === "NEUTRAL" ? "WATCH" : "ALERT";
  const headline = input.news[0]?.headline;

  return {
    symbol: input.symbol,
    direction,
    thesis:
      `Rule-based fallback thesis for ${input.symbol}: price is ${priceChangePct.toFixed(2)}% versus the previous close. ` +
      `${asSentence(vwapSignal?.interpretation ?? emaSignal?.interpretation ?? "Intraday trend context is limited.")} ` +
      `${headline ? `Latest headline reviewed: ${headline}` : "No recent headline was available."}`,
    confidenceScore: 0.35,
    bullishFactors: [
      priceChangePct > 0
        ? `Price is up ${priceChangePct.toFixed(2)}% versus the previous close.`
        : "The setup remains watchable while price action stabilizes.",
      vwapSignal?.interpretation ?? emaSignal?.interpretation ?? "Intraday indicator data was partially available.",
    ],
    bearishFactors: [
      priceChangePct < 0
        ? `Price is down ${Math.abs(priceChangePct).toFixed(2)}% versus the previous close.`
        : "The fallback thesis has lower confidence because the AI agent did not complete.",
      momentumSignal?.interpretation ?? newsSentiment?.interpretation ?? "Intraday momentum could not be fully evaluated.",
    ],
    riskExplanation:
      "This is a degraded rule-based fallback because the AI agent did not return in time. Treat it as a lower-confidence note, not a full AI thesis.",
    suggestedAction,
    timeHorizon: "1W",
    traceId,
    setup: {
      bias:
        direction === "BULLISH"
          ? "LONG"
          : direction === "BEARISH"
            ? "SHORT"
            : "NEUTRAL",
      setupType: direction === "NEUTRAL" ? "NO_TRADE" : "SCALP",
      entryZone: "Wait for confirmation around the current price before paper-trade entry.",
      stopLoss: "Use the nearest intraday invalidation level from VWAP, EMA, or range structure.",
      takeProfit: "Target the next intraday range boundary or a minimum 1.5R paper-trade exit.",
      riskReward: "At least 1.5:1 preferred before tracking as an active setup.",
      maxHoldTime: "Intraday only; reassess before the next session or major liquidity handoff.",
      warnings: [
        "Fallback setup generated without a completed AI agent response.",
        "Confirm liquidity, spread, and candle structure before treating this as tradable.",
      ],
    },
    tradePlan: {
      entryTrigger:
        direction === "BEARISH"
          ? "Watch for continued downside below the current price and confirmation from new signals."
          : "Watch for follow-through above the current price and confirmation from new signals.",
      invalidation:
        direction === "BEARISH"
          ? "Reassess if price recovers and signals turn positive."
          : "Reassess if price weakens or signals turn negative.",
      watchConditions: [
        "Re-run AI analysis when the agent service is responsive.",
        "Monitor price movement versus the thesis start price.",
        "Review new headlines before acting on this setup.",
      ],
    },
    watchlistEntry: {
      symbol: input.symbol,
      reason: "Fallback thesis generated after AI agent timeout or failure.",
      direction,
      confidenceScore: 0.35,
      createdAt: new Date().toISOString(),
    },
  };
}

function asSentence(text: string) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function getThesisString(
  thesis: unknown,
  key: string,
  fallback: string
): string {
  if (!thesis || typeof thesis !== "object" || !(key in thesis)) {
    return fallback;
  }

  const value = (thesis as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value : fallback;
}

function getThesisNumber(thesis: unknown, key: string): number | null {
  if (!thesis || typeof thesis !== "object" || !(key in thesis)) {
    return null;
  }

  const value = (thesis as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default router;
