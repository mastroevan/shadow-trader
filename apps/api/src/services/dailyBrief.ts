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
    `${activeRecords.length} active thesis record${activeRecords.length === 1 ? "" : "s"} under monitoring.`,
    `${openAlerts.length} open automation alert${openAlerts.length === 1 ? "" : "s"} needs review.`,
    `${expiringSoon.length} active thesis record${expiringSoon.length === 1 ? "" : "s"} expires within 24 hours.`,
    `${resolvedToday.length} thesis outcome${resolvedToday.length === 1 ? "" : "s"} marked today.`,
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
