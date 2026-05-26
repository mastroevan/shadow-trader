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
        const agentResponse = await fetch(AGENT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(agentPayload),
        });

        if (!agentResponse.ok) {
          const errorText = await agentResponse.text();

          throw new Error(
            `The agent service failed to analyze the symbol. Status ${agentResponse.status}: ${errorText}`
          );
        }

        return (await agentResponse.json()) as { traceId?: string };
      }
    );

    return res.json({
      thesis,
      traceId,
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

export default router;
