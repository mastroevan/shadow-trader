import { Router } from "express";
import {
  clearLedgerEntries,
  closeTradeEntry,
  deleteLedgerEntry,
  deleteWatchlistEntry,
  listLedgerEntries,
  listTradeEntries,
  listWatchlistEntries,
  moveWatchlistEntry,
  openPaperTradeEntry,
  skipPendingWatchlistConfirmation,
  updatePaperTradeEntry,
  upsertWatchlistEntry,
} from "../services/watchlist";
import {
  normalizeTimeHorizon,
  normalizeWatchlistStatus,
  parseNullableNumber,
  isWatchlistStatus,
} from "../services/watchlistFields";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  const entries = await listWatchlistEntries();

  return res.json({ entries });
});

router.get("/trade-list", async (_req, res) => {
  const entries = await listTradeEntries();

  return res.json({ entries });
});

router.get("/trust-ledger", async (_req, res) => {
  const entries = await listLedgerEntries();

  return res.json({ entries });
});

router.post("/watchlist", async (req, res) => {
  const symbol = String(req.body.symbol ?? "").trim().toUpperCase();

  if (!symbol) {
    return res.status(400).json({
      error: "MISSING_SYMBOL",
      message: "A symbol is required to add a watchlist entry.",
    });
  }

  const { entry, created } = await upsertWatchlistEntry({
    symbol,
    direction: String(req.body.direction ?? "NEUTRAL"),
    suggestedAction: String(req.body.suggestedAction ?? "WATCH"),
    confidenceScore:
      typeof req.body.confidenceScore === "number"
        ? req.body.confidenceScore
        : null,
    startPrice: parseNullableNumber(req.body.startPrice),
    thesis: String(req.body.thesis ?? ""),
    entryTrigger: String(req.body.entryTrigger ?? "Watch for signal confirmation."),
    invalidation: String(req.body.invalidation ?? "Reassess if the original thesis breaks."),
    entryZone:
      typeof req.body.entryZone === "string" ? req.body.entryZone : undefined,
    stopLossTrigger:
      typeof req.body.stopLossTrigger === "string"
        ? req.body.stopLossTrigger
        : undefined,
    takeProfitTrigger:
      typeof req.body.takeProfitTrigger === "string"
        ? req.body.takeProfitTrigger
        : undefined,
    watchConditions: Array.isArray(req.body.watchConditions)
      ? req.body.watchConditions.map(String).slice(0, 5)
      : [],
    riskExplanation:
      typeof req.body.riskExplanation === "string"
        ? req.body.riskExplanation
        : undefined,
    news: Array.isArray(req.body.news)
      ? req.body.news.slice(0, 5).map((item: { headline?: unknown; source?: unknown; url?: unknown }) => ({
          headline: typeof item.headline === "string" ? item.headline : undefined,
          source: typeof item.source === "string" ? item.source : undefined,
          url: typeof item.url === "string" ? item.url : undefined,
        }))
      : [],
    traceId:
      typeof req.body.traceId === "string" ? req.body.traceId : undefined,
    volumeConfirmation:
      typeof req.body.volumeConfirmation === "boolean" ? req.body.volumeConfirmation : null,
    trendStrength: parseNullableNumber(req.body.trendStrength),
    marketCondition:
      typeof req.body.marketCondition === "string" ? req.body.marketCondition : undefined,
    triggerType:
      typeof req.body.triggerType === "string" ? req.body.triggerType : undefined,
    timeHorizon: normalizeTimeHorizon(req.body.timeHorizon),
    status: "Watching",
  });

  return res.status(created ? 201 : 200).json({ entry });
});

router.patch("/watchlist/:id/status", async (req, res) => {
  const nextStatus = normalizeWatchlistStatus(req.body.status);
  if (
    !isWatchlistStatus(req.body.status) ||
    nextStatus === "Watching" ||
    nextStatus === "Triggered Review" ||
    nextStatus === "Pending Confirmation"
  ) {
    return res.status(400).json({
      error: "INVALID_WATCHLIST_STATUS",
      message: "Status must be Triggered, Invalidated, or Expired.",
    });
  }
  const move = await moveWatchlistEntry(req.params.id, nextStatus);

  if (!move) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message:
        nextStatus === "Triggered"
          ? "No approved watchlist entry was found for that id. Entries must pass the risk gate before they can be triggered."
          : "No watchlist entry was found for that id.",
    });
  }

  return res.json({ entry: move.entry });
});

router.post("/watchlist/:id/paper-trade", async (req, res) => {
  const move = await openPaperTradeEntry(req.params.id, {
    entryPrice: parseNullableNumber(req.body.entryPrice),
    quantity: parseNullableNumber(req.body.quantity),
    stopLoss: parseNullableNumber(req.body.stopLoss),
    takeProfit: parseNullableNumber(req.body.takeProfit),
    fees: parseNullableNumber(req.body.fees),
    slippage: parseNullableNumber(req.body.slippage),
    notes: typeof req.body.notes === "string" ? req.body.notes : undefined,
  });

  if (!move) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No approved watchlist entry was found for that id.",
    });
  }

  return res.status(201).json({ entry: move.entry });
});

router.post("/watchlist/:id/skip-confirmation", async (req, res) => {
  const entry = await skipPendingWatchlistConfirmation(req.params.id);

  if (!entry) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No pending watchlist entry was found for that id.",
    });
  }

  return res.json({ entry });
});

router.patch("/paper-trades/:id", async (req, res) => {
  const entry = await updatePaperTradeEntry(req.params.id, {
    currentPrice: parseNullableNumber(req.body.currentPrice),
    stopLoss: parseNullableNumber(req.body.stopLoss),
    takeProfit: parseNullableNumber(req.body.takeProfit),
    notes: typeof req.body.notes === "string" ? req.body.notes : undefined,
  });

  if (!entry) {
    return res.status(404).json({
      error: "PAPER_TRADE_NOT_FOUND",
      message: "No active paper trade was found for that id.",
    });
  }

  return res.json({ entry });
});

router.patch("/trade-list/:id/close", async (req, res) => {
  const outcome = String(req.body.outcome ?? "");

  if (outcome !== "Win" && outcome !== "Loss") {
    return res.status(400).json({
      error: "INVALID_TRADE_OUTCOME",
      message: "Outcome must be Win or Loss.",
    });
  }

  const entry = await closeTradeEntry(req.params.id, outcome, {
    exitPrice: parseNullableNumber(req.body.exitPrice),
    notes: typeof req.body.notes === "string" ? req.body.notes : undefined,
  });

  if (!entry) {
    return res.status(404).json({
      error: "TRADE_ENTRY_NOT_FOUND",
      message: "No trade entry was found for that id.",
    });
  }

  return res.json({ entry });
});

router.delete("/watchlist/:id", async (req, res) => {
  const deleted = await deleteWatchlistEntry(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No watchlist entry was found for that id.",
    });
  }

  return res.status(204).send();
});

router.delete("/trust-ledger/:id", async (req, res) => {
  const deleted = await deleteLedgerEntry(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      error: "LEDGER_ENTRY_NOT_FOUND",
      message: "No trust ledger entry was found for that id.",
    });
  }

  return res.status(204).send();
});

router.delete("/trust-ledger", async (_req, res) => {
  const deletedCount = await clearLedgerEntries();

  return res.json({ deletedCount });
});

export default router;
