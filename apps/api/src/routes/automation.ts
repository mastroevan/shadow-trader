import { Router } from "express";
import { monitorActiveTheses } from "../services/automation";
import { acknowledgeAlert, listAlerts } from "../services/alerts";
import { generateDailyBrief } from "../services/dailyBrief";

const router = Router();

router.get("/alerts", async (_req, res) => {
  const alerts = await listAlerts();

  return res.json({ alerts });
});

router.patch("/alerts/:id/acknowledge", async (req, res) => {
  const alert = await acknowledgeAlert(req.params.id);

  if (!alert) {
    return res.status(404).json({
      error: "ALERT_NOT_FOUND",
      message: "No alert was found for that id.",
    });
  }

  return res.json({ alert });
});

router.post("/automation/monitor", async (_req, res) => {
  const summary = await monitorActiveTheses();

  return res.json({ summary });
});

router.get("/daily-brief", async (_req, res) => {
  const brief = await generateDailyBrief();

  return res.json({ brief });
});

export default router;
