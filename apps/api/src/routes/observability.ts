import { Router } from "express";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const router = Router();
const AGENT_HEALTH_URL =
  process.env.AGENT_HEALTH_URL ??
  (process.env.AGENT_URL ?? "http://localhost:8000/analyze").replace(
    /\/analyze\/?$/,
    "/health"
  );

router.get("/observability/health", async (_req, res) => {
  let agent: unknown = null;
  let agentReachable = false;

  try {
    const response = await fetchWithTimeout(AGENT_HEALTH_URL, undefined, 5000);
    agentReachable = response.ok;
    agent = await response.json();
  } catch (error) {
    agent = {
      error: error instanceof Error ? error.message : "Unknown agent health error",
    };
  }

  if (!agentReachable) {
    console.warn("Observability health degraded:", {
      agentReachable,
      agentHealthUrl: AGENT_HEALTH_URL,
    });
  }

  return res.status(agentReachable ? 200 : 503).json({
    status: agentReachable ? "ok" : "degraded",
    agent: {
      reachable: agentReachable,
      health: agent,
      healthUrl: AGENT_HEALTH_URL,
    },
  });
});

export default router;
