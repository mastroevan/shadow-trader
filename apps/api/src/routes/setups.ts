import { Router } from "express";
import { getMarketSnapshot, isValidMarketQuote } from "../services/marketSnapshot";
import { analyzeSetup, SetupAnalysisError } from "../services/setupAnalysis";
import { resolveInstrument } from "../utils/symbols";

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

router.post("/setups/analyze", async (req, res) => {
  try {
    const analysis = await analyzeSetup({
      symbol: String(req.body.symbol ?? ""),
      assetClass: req.body.assetClass,
      exchange: req.body.exchange,
      timeframe: req.body.timeframe,
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

export default router;
