import { Router } from "express";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const router = Router();
const AGENT_HEALTH_URL =
  process.env.AGENT_HEALTH_URL ??
  (process.env.AGENT_URL ?? "http://localhost:8000/analyze").replace(
    /\/analyze\/?$/,
    "/health"
  );
const ARIZE_ENDPOINT = "https://otlp.arize.com/v1/traces";

router.get("/observability/health", async (_req, res) => {
  const arizeApiKey = process.env.ARIZE_API_KEY?.trim();
  const arizeSpaceKey = process.env.ARIZE_SPACE_KEY?.trim();
  const arize = {
    configured: Boolean(arizeApiKey && arizeSpaceKey),
    exportCheck: "not_configured" as
      | "not_configured"
      | "accepted_or_reachable"
      | "forbidden"
      | "failed",
    message: "",
  };

  if (arize.configured) {
    const apiKey = arizeApiKey as string;
    const spaceKey = arizeSpaceKey as string;

    try {
      const response = await fetchWithTimeout(
        ARIZE_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-protobuf",
            api_key: apiKey,
            space_key: spaceKey,
          },
          body: new Uint8Array(),
        },
        5000
      );

      arize.exportCheck =
        response.status === 403 ? "forbidden" : "accepted_or_reachable";
      arize.message =
        response.status === 403
          ? "Arize rejected the configured API/space keys with 403 Forbidden."
          : `Arize endpoint responded with ${response.status}; credentials were not rejected with 403.`;
    } catch (error) {
      arize.exportCheck = "failed";
      arize.message =
        error instanceof Error ? error.message : "Unknown Arize health error";
    }
  } else {
    arize.message = "ARIZE_API_KEY and ARIZE_SPACE_KEY are not both set.";
  }

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

  const healthy =
    agentReachable &&
    arize.configured &&
    arize.exportCheck !== "forbidden" &&
    arize.exportCheck !== "failed";

  if (!healthy) {
    console.warn("Observability health degraded:", {
      arize,
      agentReachable,
      agentHealthUrl: AGENT_HEALTH_URL,
    });
  }

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    arize,
    agent: {
      reachable: agentReachable,
      health: agent,
      healthUrl: AGENT_HEALTH_URL,
    },
  });
});

export default router;
