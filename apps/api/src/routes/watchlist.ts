import { Router } from "express";
import {
  createWatchlistEntry,
  deleteWatchlistEntry,
  listWatchlistEntries,
  updateWatchlistEntryStatus,
} from "../services/watchlist";
import { appendWatchlistRow, updateWatchlistRowStatus } from "../services/googleSheets";
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

router.post("/watchlist", async (req, res) => {
  const symbol = String(req.body.symbol ?? "").trim().toUpperCase();

  if (!symbol) {
    return res.status(400).json({
      error: "MISSING_SYMBOL",
      message: "A symbol is required to add a watchlist entry.",
    });
  }

  const entry = await createWatchlistEntry({
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
    traceId:
      typeof req.body.traceId === "string" ? req.body.traceId : undefined,
    timeHorizon: normalizeSheetsHorizon(req.body.timeHorizon),
    status: normalizeWatchlistStatus(req.body.status),
  });

  try {
    await appendWatchlistRow({
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
    await deleteWatchlistEntry(entry.id).catch((rollbackError) => {
      console.error("Could not roll back local watchlist entry:", rollbackError);
    });
    console.error("Could not append watchlist entry to Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The watchlist entry could not be saved to Google Sheets. Check the API logs for details.",
    });
  }

  return res.status(201).json({ entry });
});

router.patch("/watchlist/:id/status", async (req, res) => {
  if (!isWatchlistStatus(req.body.status)) {
    return res.status(400).json({
      error: "INVALID_WATCHLIST_STATUS",
      message: "Status must be Watching, Triggered, Invalidated, or Expired.",
    });
  }
  const nextStatus = normalizeWatchlistStatus(req.body.status);

  const entries = await listWatchlistEntries();
  const previousEntry = entries.find((entry) => entry.id === req.params.id);

  if (!previousEntry) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No watchlist entry was found for that id.",
    });
  }

  const entry = await updateWatchlistEntryStatus(req.params.id, nextStatus);

  if (!entry) {
    return res.status(404).json({
      error: "WATCHLIST_ENTRY_NOT_FOUND",
      message: "No watchlist entry was found for that id.",
    });
  }

  try {
    await updateWatchlistRowStatus(entry);
  } catch (error) {
    await updateWatchlistEntryStatus(previousEntry.id, previousEntry.status).catch(
      (rollbackError) => {
        console.error("Could not roll back local watchlist status:", rollbackError);
      }
    );
    console.error("Could not update watchlist status in Google Sheets:", error);

    return res.status(502).json({
      error: "GOOGLE_SHEETS_SYNC_FAILED",
      message:
        "The watchlist status could not be saved to Google Sheets. Check the API logs for details.",
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
