import { randomUUID } from "node:crypto";
import { getMarketSnapshot, isValidMarketQuote } from "./marketSnapshot";
import { createThesisRecord } from "./theses";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { generateSignals } from "../utils/signals";
import { getAliasSuggestion, resolveInstrument } from "../utils/symbols";
import type {
  Instrument,
  MarketNewsItem,
  MarketQuote,
  MarketSnapshot,
  TechnicalIndicators,
} from "../types/market";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000/analyze";
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 95000);

export type SetupAnalysisInput = {
  symbol: string;
  assetClass?: unknown;
  exchange?: unknown;
  timeframe?: unknown;
};

export type SetupAnalysisResult = {
  thesis: Record<string, unknown>;
  traceId: string;
  thesisRecord: Awaited<ReturnType<typeof createThesisRecord>>;
  thesisRecordId: string;
  agentStatus: "AI_AGENT" | "RULE_BASED_FALLBACK";
  agentFailure?: {
    reason: string;
    message: string;
  };
  quote: MarketQuote;
  candles: MarketSnapshot["candles"];
  signals: string[];
  signalDetails: ReturnType<typeof generateSignals>;
  news: MarketNewsItem[];
  technicals: TechnicalIndicators | null;
  meta: {
    symbol: string;
    instrument: Instrument;
    originalInput: string;
    analyzedAt: string;
    quoteSource: MarketQuote["source"];
    candleCount: number;
  };
};

export class SetupAnalysisError extends Error {
  statusCode: number;
  payload: Record<string, unknown>;

  constructor(statusCode: number, payload: Record<string, unknown>) {
    super(String(payload.message ?? payload.error ?? "Setup analysis failed."));
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export async function analyzeSetup(input: SetupAnalysisInput): Promise<SetupAnalysisResult> {
  const originalInput = input.symbol.trim();

  if (!originalInput) {
    throw new SetupAnalysisError(400, {
      error: "MISSING_SYMBOL",
      message: "Please enter a ticker symbol.",
    });
  }

  const instrument = resolveInstrument({
    symbol: originalInput,
    assetClass: input.assetClass,
    exchange: input.exchange,
    timeframe: input.timeframe,
  });
  const snapshot = await getMarketSnapshot(instrument);
  const { quote, candles, news, technicals } = snapshot;
  const symbol = instrument.displaySymbol || instrument.symbol;

  if (!isValidMarketQuote(quote)) {
    const suggestion = getAliasSuggestion(originalInput);

    throw new SetupAnalysisError(400, {
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

  const signalDetails = generateSignals({
    instrument,
    quote,
    candles,
    news,
  });

  const newsSignals = news.slice(0, 5).map((item) => {
    return `News headline from ${item.source}: ${item.headline}. ${item.summary}`;
  });

  const signals = [
    ...signalDetails.map((signal) => {
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
    signals,
    signalDetails,
    news,
    news_context: newsSignals.join("\n"),
  };

  const { thesis, traceId, agentStatus, agentFailure } = await getAgentThesis({
    symbol,
    instrument,
    quote,
    candles,
    signals: signalDetails,
    signalStrings: signals,
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
      signals,
      signalDetails,
      news,
      technicals,
    },
    traceId,
    initialPrice: quote.price,
    timeHorizon: getThesisString(thesis, "timeHorizon", "1W"),
  });

  return {
    thesis,
    traceId,
    thesisRecord,
    thesisRecordId: thesisRecord.id,
    agentStatus,
    agentFailure,
    quote,
    candles,
    signals,
    signalDetails,
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
  };
}

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
  agentFailure?: {
    reason: string;
    message: string;
  };
}> {
  try {
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

    const thesis = (await agentResponse.json()) as Record<string, unknown> & {
      traceId?: string;
    };

    return {
      thesis,
      // Per-analysis ID carried through the watchlist and shown in the UI.
      traceId: thesis.traceId ?? randomUUID(),
      agentStatus: "AI_AGENT",
    };
  } catch (error) {
    console.warn("Agent thesis failed; using rule-based fallback:", error);

    const traceId = `fallback-${randomUUID()}`;
    const agentFailure = describeAgentFailure(error);

    return {
      thesis: buildFallbackThesis(input, traceId),
      traceId,
      agentStatus: "RULE_BASED_FALLBACK",
      agentFailure,
    };
  }
}

function getSafeAgentTimeout() {
  return Number.isFinite(AGENT_TIMEOUT_MS) && AGENT_TIMEOUT_MS >= 5000
    ? AGENT_TIMEOUT_MS
    : 95000;
}

function describeAgentFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("timed out") || lowerMessage.includes("timeout")) {
    return {
      reason: "TIMEOUT",
      message,
    };
  }

  if (lowerMessage.includes("econnrefused") || lowerMessage.includes("failed to fetch")) {
    return {
      reason: "AGENT_UNREACHABLE",
      message,
    };
  }

  if (lowerMessage.includes("api key") || lowerMessage.includes("credential")) {
    return {
      reason: "AGENT_CONFIG",
      message,
    };
  }

  if (
    lowerMessage.includes("resource_exhausted") ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("prepayment credits") ||
    lowerMessage.includes("billing")
  ) {
    return {
      reason: "AGENT_QUOTA",
      message,
    };
  }

  if (lowerMessage.includes("non-json") || lowerMessage.includes("invalid thesis payload")) {
    return {
      reason: "INVALID_AGENT_RESPONSE",
      message,
    };
  }

  return {
    reason: "AGENT_ERROR",
    message,
  };
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
    strategy: direction === "NEUTRAL" ? "No-trade review" : "Intraday momentum",
    tradingStyle: "Day Trading",
    analysisTimeframe: input.instrument.timeframe,
    expectedHold: "Intraday only; reassess before the next session or major liquidity handoff.",
    analysisReason:
      "Fallback selected intraday analysis from the available chart because the AI agent did not complete a full timeframe and style decision.",
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

export function getThesisString(
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

export function getThesisNumber(thesis: unknown, key: string): number | null {
  if (!thesis || typeof thesis !== "object" || !(key in thesis)) {
    return null;
  }

  const value = (thesis as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
