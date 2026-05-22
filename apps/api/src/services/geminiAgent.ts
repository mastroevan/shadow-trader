// apps/api/src/services/geminiAgent.ts
import axios from 'axios';
import { Investigation, TradingThesis } from '../types';

const AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';

export async function callGeminiAgent(
  investigation: Investigation,
  sessionId: string
): Promise<TradingThesis> {

  // Build the news context string from structured news items
  const newsContext = investigation.newsContext
    .map(n => `[${n.sentiment}] ${n.headline} (${n.source}, ${n.publishedAt})`)
    .join('\n');

  // Build the signals list from structured signal objects
  const signals = investigation.signals.map(s =>
    `${s.signalType}: ${s.percentChange.toFixed(1)}% change, severity=${s.severity}, source=${s.source}`
  );

  const payload = {
    symbol: investigation.symbol,
    signals,
    news_context: newsContext,
    sentiment_score: investigation.sentimentScore,
  };

  try {
    const response = await axios.post<TradingThesis>(
      `${AGENT_URL}/analyze`,
      payload,
      { timeout: 60000 }  // 60s — Gemini reasoning can take a moment
    );

    return response.data;
  } catch (err: any) {
    if (err.response) {
      throw new Error(`Agent service error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw new Error(`Could not reach Python agent service at ${AGENT_URL}: ${err.message}`);
  }
}
