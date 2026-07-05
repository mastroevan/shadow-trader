import { Router } from "express";
import { runTriggerAutomation } from "../services/automation";

const router = Router();

router.post("/automation/run", async (_req, res) => {
  try {
    const result = await runTriggerAutomation();

    return res.json({ result });
  } catch (error) {
    console.error("Trigger automation failed:", error);

    return res.status(500).json({
      error: "AUTOMATION_FAILED",
      message: "Trigger automation failed.",
    });
  }
});

export default router;
