// apps/api/src/routes/analyze.ts

import { Router } from "express";
import {
  getFinnhubCompanyNews,
  getFinnhubQuote,
  getTechnicalIndicators,
  isValidFinnhubQuote,
} from "../services/finnhub";
import { normalizeSymbol, getAliasSuggestion } from "../utils/symbols";
import { generateSignals } from "../utils/signals";
import { traceAgentCall } from "../services/arizeTracker";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { createThesisRecord } from "../services/theses";

const router = Router();

const AGENT_URL =
  process.env.AGENT_URL ?? "http://localhost:8000/analyze";

router.post("/analyze", async (req, res) => {
  try {
    const originalInput = String(req.body.symbol ?? "").trim();

    if (!originalInput) {
      return res.status(400).json({
        error: "MISSING_SYMBOL",
        message: "Please enter a ticker symbol.",
      });
    }

    const symbol = normalizeSymbol(originalInput);

    const quote = await getFinnhubQuote(symbol);

    if (!isValidFinnhubQuote(quote)) {
      const suggestion = getAliasSuggestion(originalInput);

      return res.status(400).json({
        error: "NO_QUOTE_FOUND",
        message: suggestion
          ? `No quote found for ${originalInput}. Did you mean ${suggestion}?`
          : `No quote found for ${originalInput}. Try AMZN, NVDA, TSLA, AAPL, META, or GOOGL.`,
        originalInput,
        symbol,
        suggestion,
        quote,
      });
    }

    const [news, technicals] = await Promise.all([
      getFinnhubCompanyNews(symbol),
      getTechnicalIndicators(symbol),
    ]);

    const signals = generateSignals({
      quote,
      news,
      technicals,
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
      quote,
      signals: signalStrings,
      signalDetails: signals,
      news,
      news_context: newsSignals.join("\n"),
    };

    const { result: thesis, traceId } = await traceAgentCall(
      "shadow_trader.analyze",
      {
        symbol,
        signalCount: signalStrings.length,
        newsCount: news.length,
        quoteSource: quote.source,
        sma20: technicals?.sma20,
      },
      async () => {
        const agentResponse = await fetchWithTimeout(AGENT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(agentPayload),
        }, 60000);

        if (!agentResponse.ok) {
          const errorText = await agentResponse.text();

          throw new Error(
            `The agent service failed to analyze the symbol. Status ${agentResponse.status}: ${errorText}`
          );
        }

        return (await agentResponse.json()) as { traceId?: string };
      }
    );

    const thesisRecord = await createThesisRecord({
      symbol,
      direction: getThesisString(thesis, "direction", "NEUTRAL"),
      suggestedAction: getThesisString(thesis, "suggestedAction", "WATCH"),
      confidenceScore: getThesisNumber(thesis, "confidenceScore"),
      thesis,
      evidence: {
        quote,
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
      quote,
      signals: signalStrings,
      signalDetails: signals,
      news,
      technicals,
      meta: {
        symbol,
        originalInput,
        analyzedAt: new Date().toISOString(),
        quoteSource: quote.source,
      },
    });
  } catch (error) {
    console.error("Analyze route failed:", error);

    return res.status(500).json({
      error: "ANALYZE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unknown analyze route error",
    });
  }
});

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
