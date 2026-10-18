import { Router } from "express";
import { getMarketSnapshot, isValidMarketQuote } from "../services/marketSnapshot";
import {
  analyzeSetup,
  compareSetups,
  getAgentModelRegistry,
  SetupAnalysisError,
} from "../services/setupAnalysis";
import { resolveInstrument } from "../utils/symbols";
import { runBacktest } from "../services/backtesting";

const router = Router();

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

router.get("/market/stream", async (req, res) => {
  const originalInput = String(req.query.symbol ?? "").trim();

  if (!originalInput) {
    return res.status(400).json({
      error: "MISSING_SYMBOL",
      message: "Please provide a symbol query parameter.",
    });
  }

  // Configure SSE response headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const instrument = resolveInstrument({
    symbol: originalInput,
    assetClass: typeof req.query.assetClass === "string" ? req.query.assetClass : undefined,
    exchange: typeof req.query.exchange === "string" ? req.query.exchange : undefined,
    timeframe: typeof req.query.timeframe === "string" ? req.query.timeframe : undefined,
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", {
    status: "connected",
    symbol: originalInput,
    timestamp: new Date().toISOString(),
  });

  let isClosed = false;

  const pushSnapshot = async () => {
    if (isClosed) return;
    try {
      const snapshot = await getMarketSnapshot(instrument);
      if (isValidMarketQuote(snapshot.quote)) {
        sendEvent("snapshot", {
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
      }
    } catch (err) {
      sendEvent("error", {
        message: err instanceof Error ? err.message : "Failed to fetch market snapshot",
      });
    }
  };

  await pushSnapshot();

  const intervalMs = Math.max(5000, Math.min(60000, Number(req.query.intervalMs) || 10000));
  const updateInterval = setInterval(pushSnapshot, intervalMs);

  const heartbeatInterval = setInterval(() => {
    if (!isClosed) {
      res.write(": heartbeat\n\n");
    }
  }, 15000);

  req.on("close", () => {
    isClosed = true;
    clearInterval(updateInterval);
    clearInterval(heartbeatInterval);
  });
});

router.get("/agent/models", async (_req, res) => {
  try {
    const registry = await getAgentModelRegistry();
    return res.json(registry);
  } catch (error) {
    console.error("Agent models route failed:", error);
    return res.status(500).json({
      error: "AGENT_MODELS_FAILED",
      message: error instanceof Error ? error.message : "Failed to fetch model registry",
    });
  }
});

router.post("/setups/analyze", async (req, res) => {
  try {
    const analysis = await analyzeSetup({
      symbol: String(req.body.symbol ?? ""),
      assetClass: req.body.assetClass,
      exchange: req.body.exchange,
      timeframe: req.body.timeframe,
      provider: typeof req.body.provider === "string" ? req.body.provider : undefined,
      model: typeof req.body.model === "string" ? req.body.model : undefined,
    });

    return res.json(analysis);
  } catch (error) {
    if (error instanceof SetupAnalysisError) {
      return res.status(error.statusCode).json(error.payload);
    }

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

router.post("/setups/compare", async (req, res) => {
  try {
    const symbol = String(req.body.symbol ?? "").trim();
    if (!symbol) {
      return res.status(400).json({
        error: "MISSING_SYMBOL",
        message: "Please enter a symbol for model comparison.",
      });
    }

    const result = await compareSetups({
      symbol,
      targets: Array.isArray(req.body.targets) ? req.body.targets : undefined,
      assetClass: req.body.assetClass,
      exchange: req.body.exchange,
      timeframe: req.body.timeframe,
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof SetupAnalysisError) {
      return res.status(error.statusCode).json(error.payload);
    }

    console.error("Setup compare route failed:", error);
    return res.status(500).json({
      error: "SETUP_COMPARE_FAILED",
      message: error instanceof Error ? error.message : "Failed to compare setup models",
    });
  }
});

router.post("/backtest/run", async (req, res) => {
  try {
    const symbol = String(req.body.symbol ?? "").trim();
    if (!symbol) {
      return res.status(400).json({
        error: "MISSING_SYMBOL",
        message: "Please enter a symbol for the backtest.",
      });
    }

    const result = await runBacktest({
      symbol,
      strategy: req.body.strategy,
      lookbackDays: req.body.lookbackDays,
      timeframe: req.body.timeframe,
      initialCapital: req.body.initialCapital,
      riskPerTradePercent: req.body.riskPerTradePercent,
      minRiskReward: req.body.minRiskReward,
    });

    return res.json(result);
  } catch (error) {
    console.error("Backtest route failed:", error);
    return res.status(500).json({
      error: "BACKTEST_FAILED",
      message: error instanceof Error ? error.message : "Unknown backtest error",
    });
  }
});

export default router;
