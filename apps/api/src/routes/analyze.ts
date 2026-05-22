// apps/api/src/routes/analyze.ts
import { Router } from 'express';
import { detectVolumeAnomaly, getNewsForSymbol, getSentimentScore, getLatestQuote } from '../services/marketData';
import { callGeminiAgent } from '../services/geminiAgent';
import { traceAgentCall } from '../services/arizeTracker';

export const analyzeRouter = Router();

analyzeRouter.post('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    // Step 1 — Monitor: fetch signals in parallel
    const [quote, volumeSignal, news, sentiment] = await Promise.all([
      getLatestQuote(symbol),
      detectVolumeAnomaly(symbol),
      getNewsForSymbol(symbol, 5),
      getSentimentScore(symbol),
    ]);

    const signals = [volumeSignal].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal));

    // Step 2 — Investigate: assemble context
    const investigation = {
      symbol,
      signals,
      newsContext: news,
      historicalPatterns: [],
      sentimentScore: sentiment,
    };

    // Steps 3+4 — Reason via Python ADK + Arize trace
    const { result: thesis, traceId } = await traceAgentCall(
      'shadow_trader_analysis',
      { symbol, signalCount: signals.length, sentimentScore: sentiment },
      () => callGeminiAgent(investigation, '')  // sessionId managed by Python now
    );

    res.json({
      thesis,
      traceId,
      signals,
      quote,
      meta: {
        symbol,
        analyzedAt: new Date().toISOString(),
        agentModel: 'gemini-2.5-flash',
        agentVersion: 'adk-1.0',
      }
    });

  } catch (err: any) {
    console.error(`[analyze/${symbol}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});