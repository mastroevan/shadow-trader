import { Router } from "express";
import {
  createWatchlistEntry,
  deleteWatchlistEntry,
  listWatchlistEntries,
} from "../services/watchlist";

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
    thesis: String(req.body.thesis ?? ""),
    entryTrigger: String(req.body.entryTrigger ?? "Watch for signal confirmation."),
    invalidation: String(req.body.invalidation ?? "Reassess if the original thesis breaks."),
    watchConditions: Array.isArray(req.body.watchConditions)
      ? req.body.watchConditions.map(String).slice(0, 5)
      : [],
    traceId:
      typeof req.body.traceId === "string" ? req.body.traceId : undefined,
  });

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

export default router;
