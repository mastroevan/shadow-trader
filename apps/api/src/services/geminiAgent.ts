import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { Investigation } from "../types";


/**
 * Simple Gemini call layer (THIS is your real agent runtime for now)
 * This replaces the broken ADK runtime attempt.
 */

export async function callGeminiAgent(
  investigation: Investigation,
  _sessionId: string
) {
  const prompt = buildPrompt(investigation);

  // If you're using Vertex AI / Gemini API key approach
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(endpoint, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });

  const text =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  // Try to extract JSON safely
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("Gemini did not return valid JSON");
  }

  return JSON.parse(match[0]);
}

/**
 * Build prompt from your investigation object
 */
function buildPrompt(inv: Investigation): string {
  return `
You are Shadow Trader, a market intelligence agent.

Analyze the following:

SYMBOL: ${inv.symbol}

SIGNALS:
${inv.signals.map(s => `- ${s.signalType} (${s.percentChange}%)`).join("\n")}

NEWS:
${inv.newsContext.map(n => `- ${n.headline}`).join("\n")}

SENTIMENT SCORE: ${inv.sentimentScore}

Return STRICT JSON with:
{
  "symbol": string,
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "thesis": string,
  "confidenceScore": number,
  "riskExplanation": string,
  "bullishFactors": string[],
  "bearishFactors": string[],
  "suggestedAction": "WATCH" | "ALERT" | "AVOID"
}
`.trim();
}