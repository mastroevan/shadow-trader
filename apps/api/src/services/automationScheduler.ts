import { runTriggerAutomation } from "./automation";

let automationTimer: NodeJS.Timeout | null = null;
let running = false;

export function startAutomationScheduler() {
  if (process.env.AUTOMATION_ENABLED !== "true" || automationTimer) {
    return;
  }

  const intervalMs = getAutomationIntervalMs();

  automationTimer = setInterval(() => {
    void runScheduledAutomation();
  }, intervalMs);

  console.log(`Trigger automation enabled; running every ${intervalMs}ms.`);
}

async function runScheduledAutomation() {
  if (running) return;

  running = true;

  try {
    const result = await runTriggerAutomation();

    if (result.actions.length > 0 || result.errors.length > 0) {
      console.log("Trigger automation run completed", {
        actions: result.actions.length,
        errors: result.errors.length,
      });
    }
  } catch (error) {
    console.warn("Trigger automation run failed:", error);
  } finally {
    running = false;
  }
}

function getAutomationIntervalMs() {
  const configured = Number(process.env.AUTOMATION_INTERVAL_MS);

  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 900_000;
}
