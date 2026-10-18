import { Router } from "express";
import {
  closeBrokerTrade,
  executeBrokerTrade,
  getBrokerStatus,
  syncBrokerTrade,
} from "../services/brokers/brokerManager";
import { parseNullableNumber } from "../services/watchlistFields";

const router = Router();

router.get("/brokers/status", async (_req, res) => {
  try {
    const status = await getBrokerStatus();
    return res.json(status);
  } catch (error) {
    console.error("Broker status check failed:", error);
    return res.status(500).json({
      error: "BROKER_STATUS_FAILED",
      message: error instanceof Error ? error.message : "Failed to retrieve broker status",
    });
  }
});

router.post("/watchlist/:id/broker-execute", async (req, res) => {
  try {
    const result = await executeBrokerTrade(req.params.id, {
      broker: req.body.broker,
      executionMode: req.body.executionMode,
      quantity: parseNullableNumber(req.body.quantity) ?? undefined,
      entryPrice: parseNullableNumber(req.body.entryPrice) ?? undefined,
      stopLoss: parseNullableNumber(req.body.stopLoss) ?? undefined,
      takeProfit: parseNullableNumber(req.body.takeProfit) ?? undefined,
      notes: typeof req.body.notes === "string" ? req.body.notes : undefined,
    });

    if (!result) {
      return res.status(404).json({
        error: "WATCHLIST_ENTRY_NOT_FOUND",
        message: "No watchlist entry was found for that id.",
      });
    }

    if ("rejected" in result && result.rejected) {
      return res.status(422).json({
        error: "RISK_GATE_REJECTED",
        message: "This setup did not pass the risk gate.",
        reasons: result.reasons,
        checklist: result.checklist,
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error("Broker trade execution failed:", error);
    return res.status(500).json({
      error: "BROKER_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : "Failed to execute broker trade",
    });
  }
});

router.post("/trade-list/:id/broker-sync", async (req, res) => {
  try {
    const trade = await syncBrokerTrade(req.params.id);
    if (!trade) {
      return res.status(404).json({
        error: "TRADE_NOT_FOUND",
        message: "Active broker trade not found.",
      });
    }
    return res.json({ entry: trade });
  } catch (error) {
    console.error("Broker trade sync failed:", error);
    return res.status(500).json({
      error: "BROKER_SYNC_FAILED",
      message: error instanceof Error ? error.message : "Failed to sync broker trade",
    });
  }
});

router.post("/trade-list/:id/broker-close", async (req, res) => {
  try {
    const outcome = String(req.body.outcome ?? "");
    if (outcome !== "Win" && outcome !== "Loss") {
      return res.status(400).json({
        error: "INVALID_OUTCOME",
        message: "Outcome must be Win or Loss.",
      });
    }

    const entry = await closeBrokerTrade(
      req.params.id,
      outcome,
      parseNullableNumber(req.body.exitPrice) ?? undefined
    );

    if (!entry) {
      return res.status(404).json({
        error: "TRADE_NOT_FOUND",
        message: "Trade not found.",
      });
    }

    return res.json({ entry });
  } catch (error) {
    console.error("Broker close failed:", error);
    return res.status(500).json({
      error: "BROKER_CLOSE_FAILED",
      message: error instanceof Error ? error.message : "Failed to close broker trade",
    });
  }
});

export default router;
