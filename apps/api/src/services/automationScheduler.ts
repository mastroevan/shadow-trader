import { monitorActiveTheses } from "./automation";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export function startAutomationScheduler() {
  if (process.env.AUTOMATION_ENABLED === "false") {
    console.log("Shadow Trader automation scheduler disabled");
    return;
  }

  const intervalMs = Number(process.env.AUTOMATION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const safeIntervalMs =
    Number.isFinite(intervalMs) && intervalMs >= 60_000
      ? intervalMs
      : DEFAULT_INTERVAL_MS;

  setInterval(() => {
    void monitorActiveTheses()
      .then((summary) => {
        console.log(
          `Automation monitor checked ${summary.checked} thesis records, created ${summary.alertsCreated} alerts`
        );
      })
      .catch((error) => {
        console.error("Automation monitor failed:", error);
      });
  }, safeIntervalMs);

  console.log(`Shadow Trader automation scheduler running every ${safeIntervalMs}ms`);
}
