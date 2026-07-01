import { Router } from "express";
import {
  closeTradeEntry,
  deleteWatchlistEntry,
  type LedgerEntry,
  listLedgerEntries,
  listTradeEntries,
  listWatchlistEntries,
  moveWatchlistEntry,
  openPaperTradeEntry,
  rollbackWatchlistMove,
  type TradeEntry,
  updatePaperTradeEntry,
  upsertWatchlistEntry,
} from "../services/watchlist";
import {
  appendClosedTradeToLedger,
  moveWatchlistRowToLedger,
  moveWatchlistRowToTradeList,
  upsertWatchlistRow,
} from "../services/googleSheets";
import {
  normalizeSheetsDirection,
  normalizeSheetsHorizon,
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
    timeHorizon: normalizeSheetsHorizon(req.body.timeHorizon),
    status: "Watching",
  });

  try {
    await upsertWatchlistRow({
      dateGenerated: entry.createdAt.slice(0, 10),
      ticker: entry.symbol,
      thesis: normalizeSheetsDirection(entry.direction),
      confidence: entry.confidenceScore ?? "",
      action: entry.suggestedAction,
      startPrice: entry.startPrice ?? "",
      entryTrigger: entry.entryTrigger,
      invalidation: entry.invalidation,
      horizon: entry.timeHorizon,
      traceId: entry.traceId ?? "",
      status: entry.status,
      notes: entry.watchConditions.join("; "),
    });
  } catch (error) {
    // Do not report a successful save when the spreadsheet sync failed, and
    // remove the local entry so a retry does not create a duplicate.
    if (created) await deleteWatchlistEntry(entry.id).catch((rollbackError) => {
      console.error("Could not roll back local watchlist entry:", rollbackError);
    });
    console.error("Could not append watchlist entry to Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The watchlist entry could not be saved to Google Sheets. Check the API logs for details.",
    });
  }

  return res.status(created ? 201 : 200).json({ entry });
});

router.patch("/watchlist/:id/status", async (req, res) => {
  if (!isWatchlistStatus(req.body.status) || req.body.status === "Watching") {
    return res.status(400).json({
      error: "INVALID_WATCHLIST_STATUS",
      message: "Status must be Triggered, Invalidated, or Expired.",
    });
  }
  const nextStatus = normalizeWatchlistStatus(req.body.status);
  const move = await moveWatchlistEntry(req.params.id, nextStatus);

  if (!move) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No watchlist entry was found for that id.",
    });
  }

  try {
    if (nextStatus === "Triggered") {
      await moveWatchlistRowToTradeList(move.entry as TradeEntry);
    } else {
      await moveWatchlistRowToLedger(move.entry as LedgerEntry);
    }
  } catch (error) {
    await rollbackWatchlistMove(move.entry, move.previousEntry).catch((rollbackError) => {
      console.error("Could not roll back local lifecycle move:", rollbackError);
    });
    console.error("Could not move watchlist row in Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The watchlist lifecycle action could not be saved to Google Sheets. Check the API logs for details.",
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
      message: "No watchlist entry was found for that id.",
    });
  }

  try {
    await moveWatchlistRowToTradeList(move.entry);
  } catch (error) {
    await rollbackWatchlistMove(move.entry, move.previousEntry).catch((rollbackError) => {
      console.error("Could not roll back paper trade open:", rollbackError);
    });
    console.error("Could not move paper trade row in Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The paper trade could not be saved to Google Sheets. Check the API logs for details.",
    });
  }

  return res.status(201).json({ entry: move.entry });
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

  try {
    await appendClosedTradeToLedger(entry);
  } catch (error) {
    console.error("Could not append closed trade to Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The closed trade could not be saved to Google Sheets. Check the API logs for details.",
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

export default router;
