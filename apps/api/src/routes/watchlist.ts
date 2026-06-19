import { Router } from "express";
import {
  createWatchlistEntry,
  deleteWatchlistEntry,
  listWatchlistEntries,
} from "../services/watchlist";
import { appendWatchlistRow } from "../services/googleSheets";

const router = Router();
const SHEETS_DIRECTIONS = new Set(["BEARISH", "BULLISH", "NEUTRAL"]);

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
      horizon: normalizeSheetsHorizon(req.body.timeHorizon),
      traceId: entry.traceId ?? "",
      status: "Watching",
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

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSheetsDirection(value: unknown): string {
  const direction = String(value ?? "").trim().toUpperCase();

  return SHEETS_DIRECTIONS.has(direction) ? direction : "NEUTRAL";
}

function normalizeSheetsHorizon(value: unknown): string {
  const horizon = String(value ?? "").trim().toUpperCase();

  if (horizon === "SHORT" || horizon === "1D") return "SHORT";
  if (horizon === "MEDIUM") return "MEDIUM";

  return "1W";
}

export default router;
