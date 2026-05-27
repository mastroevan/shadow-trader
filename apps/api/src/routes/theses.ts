import { Router } from "express";
import {
  getThesisRecord,
  listThesisRecords,
  ThesisStatus,
  updateThesisOutcome,
} from "../services/theses";

const router = Router();
const VALID_OUTCOME_STATUSES = new Set<ThesisStatus>([
  "TRIGGERED",
  "INVALIDATED",
  "EXPIRED",
  "RESOLVED",
]);

router.get("/theses", async (_req, res) => {
  const records = await listThesisRecords();

  return res.json({
    records: records.map((record) => ({
      id: record.id,
      symbol: record.symbol,
      direction: record.direction,
      suggestedAction: record.suggestedAction,
      confidenceScore: record.confidenceScore,
      status: record.status,
      generatedAt: record.generatedAt,
      expiresAt: record.expiresAt,
      initialPrice: record.initialPrice,
      traceId: record.traceId,
      outcome: record.outcome,
    })),
  });
});

router.get("/theses/:id", async (req, res) => {
  const record = await getThesisRecord(req.params.id);

  if (!record) {
    return res.status(404).json({
      error: "THESIS_NOT_FOUND",
      message: "No thesis record was found for that id.",
    });
  }

  return res.json({ record });
});

router.patch("/theses/:id/outcome", async (req, res) => {
  const status = String(req.body.status ?? "").toUpperCase() as ThesisStatus;

  if (!VALID_OUTCOME_STATUSES.has(status)) {
    return res.status(400).json({
      error: "INVALID_OUTCOME_STATUS",
      message: "Outcome status must be TRIGGERED, INVALIDATED, EXPIRED, or RESOLVED.",
    });
  }

  const finalPrice =
    typeof req.body.finalPrice === "number" && Number.isFinite(req.body.finalPrice)
      ? req.body.finalPrice
      : null;
  const notes = String(req.body.notes ?? "").trim().slice(0, 1000);
  const record = await updateThesisOutcome(req.params.id, {
    status,
    finalPrice,
    notes,
  });

  if (!record) {
    return res.status(404).json({
      error: "THESIS_NOT_FOUND",
      message: "No thesis record was found for that id.",
    });
  }

  return res.json({ record });
});

export default router;
