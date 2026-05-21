import { Agent } from "@google/adk";

/* =========================================================
   TOOL: Analyze Market Signal
========================================================= */

const analyzeMarketSignal = {
  name: "analyze_market_signal",

  description:
    "Analyze market signals and determine potential market direction.",

  parameters: {
    type: "object",

    properties: {
      symbol: {
        type: "string",
        description: "Ticker symbol",
      },

      sentiment: {
        type: "number",
        description: "Sentiment score from 0 to 1",
      },

      volumeRatio: {
        type: "number",
        description: "Current volume divided by average volume",
      },

      priceChangePercent: {
        type: "number",
        description: "Percent price movement",
      },
    },

    required: ["symbol"],
  },

  execute: async ({
    symbol,
    sentiment = 0.5,
    volumeRatio = 1,
    priceChangePercent = 0,
  }: any) => {
    let direction = "NEUTRAL";

    if (sentiment > 0.7 && priceChangePercent > 2) {
      direction = "BULLISH";
    }

    if (sentiment < 0.3 && priceChangePercent < -2) {
      direction = "BEARISH";
    }

    return {
      symbol,
      direction,
      sentiment,
      volumeRatio,
      priceChangePercent,

      summary:
        direction === "BULLISH"
          ? "Bullish momentum detected from aligned sentiment and price action."
          : direction === "BEARISH"
          ? "Bearish pressure detected from negative sentiment and downward movement."
          : "Mixed or unclear market conditions.",
    };
  },
};

/* =========================================================
   TOOL: Assess Risk
========================================================= */

const assessRisk = {
  name: "assess_risk",

  description:
    "Assess risk level associated with a potential trading setup.",

  parameters: {
    type: "object",

    properties: {
      symbol: {
        type: "string",
      },

      direction: {
        type: "string",
      },

      confidenceScore: {
        type: "number",
      },
    },

    required: ["symbol"],
  },

  execute: async ({
    symbol,
    direction = "NEUTRAL",
    confidenceScore = 0.5,
  }: any) => {
    let riskLevel = "MEDIUM";

    if (confidenceScore < 0.4) {
      riskLevel = "HIGH";
    }

    if (confidenceScore > 0.8) {
      riskLevel = "LOW";
    }

    return {
      symbol,
      direction,
      confidenceScore,
      riskLevel,

      explanation:
        riskLevel === "HIGH"
          ? "Signal confidence is weak or conflicting."
          : riskLevel === "LOW"
          ? "Signals appear aligned with strong confidence."
          : "Moderate uncertainty remains.",
    };
  },
};

/* =========================================================
   TOOL: Generate Watchlist Entry
========================================================= */

const generateWatchlistEntry = {
  name: "generate_watchlist_entry",

  description:
    "Generate a structured watchlist entry for a monitored stock.",

  parameters: {
    type: "object",

    properties: {
      symbol: {
        type: "string",
      },

      thesis: {
        type: "string",
      },

      direction: {
        type: "string",
      },
    },

    required: ["symbol"],
  },

  execute: async ({
    symbol,
    thesis = "",
    direction = "NEUTRAL",
  }: any) => {
    return {
      symbol,
      direction,

      watchReason: thesis,

      trigger:
        direction === "BULLISH"
          ? "Watch for breakout continuation."
          : direction === "BEARISH"
          ? "Watch for downside continuation."
          : "Watch for confirmation signals.",

      createdAt: new Date().toISOString(),
    };
  },
};

/* =========================================================
   AGENT CONFIG
========================================================= */

export const shadowTraderAgent = new Agent({
  name: "shadow-trader-agent",

  model: "gemini-2.5-pro",

  description:
    "Autonomous market intelligence and anomaly detection agent.",

  instruction: `
You are Shadow Trader.

Your responsibilities:
- analyze unusual market activity
- evaluate sentiment and momentum
- explain reasoning transparently
- generate structured outputs
- estimate confidence levels
- identify bullish and bearish factors

IMPORTANT RULES:
- Never recommend directly executing trades
- Only suggest WATCH, ALERT, or AVOID
- Be transparent about uncertainty
- Use concise professional language
- Always explain reasoning

Return structured JSON whenever possible.
`,

  tools: [
    analyzeMarketSignal,
    assessRisk,
    generateWatchlistEntry,
  ] as any,
});