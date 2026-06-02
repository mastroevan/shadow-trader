import { listAlerts } from "./alerts";
import { listThesisRecords } from "./theses";

export type DailyBrief = {
  generatedAt: string;
  activeCount: number;
  openAlertCount: number;
  expiringSoonCount: number;
  resolvedTodayCount: number;
  highlights: string[];
};

export async function generateDailyBrief(): Promise<DailyBrief> {
  const generatedAt = new Date();
  const records = await listThesisRecords();
  const alerts = await listAlerts();
  const activeRecords = records.filter((record) => record.status === "ACTIVE");
  const openAlerts = alerts.filter((alert) => alert.status === "OPEN");
  const expiringSoon = activeRecords.filter((record) => {
    const expiresAt = new Date(record.expiresAt).getTime();
    const deltaMs = expiresAt - generatedAt.getTime();

    return deltaMs >= 0 && deltaMs <= 24 * 60 * 60 * 1000;
  });
  const resolvedToday = records.filter((record) => {
    if (!record.outcome?.resolvedAt) {
      return false;
    }

    return record.outcome.resolvedAt.slice(0, 10) === generatedAt.toISOString().slice(0, 10);
  });
  const highlights = [
    `${activeRecords.length} active ${pluralize("thesis record", activeRecords.length)} under monitoring.`,
    `${openAlerts.length} open automation ${pluralize("alert", openAlerts.length)} ${openAlerts.length === 1 ? "needs" : "need"} review.`,
    `${expiringSoon.length} active ${pluralize("thesis record", expiringSoon.length)} ${expiringSoon.length === 1 ? "expires" : "expire"} within 24 hours.`,
    `${resolvedToday.length} thesis ${pluralize("outcome", resolvedToday.length)} marked today.`,
  ];

  const latestHighPriorityAlert = openAlerts.find((alert) => alert.severity === "HIGH");
  if (latestHighPriorityAlert) {
    highlights.unshift(`High priority: ${latestHighPriorityAlert.title}`);
  }

  return {
    generatedAt: generatedAt.toISOString(),
    activeCount: activeRecords.length,
    openAlertCount: openAlerts.length,
    expiringSoonCount: expiringSoon.length,
    resolvedTodayCount: resolvedToday.length,
    highlights,
  };
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}
