import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED";
export type AlertType =
  | "THESIS_TRIGGERED"
  | "THESIS_INVALIDATED"
  | "THESIS_EXPIRED"
  | "MONITORING_ERROR";

export type AlertRecord = {
  id: string;
  thesisRecordId?: string;
  symbol: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
  metadata: Record<string, unknown>;
};

type CreateAlertInput = Omit<
  AlertRecord,
  "id" | "status" | "createdAt" | "acknowledgedAt"
>;

const DATA_DIR = path.join(process.cwd(), "data");
const ALERTS_PATH = path.join(DATA_DIR, "alerts.json");
let writeQueue = Promise.resolve();

export async function listAlerts(): Promise<AlertRecord[]> {
  try {
    const data = await readFile(ALERTS_PATH, "utf8");
    const alerts = JSON.parse(data) as AlertRecord[];

    return Array.isArray(alerts) ? alerts : [];
  } catch {
    return [];
  }
}

export async function createAlert(input: CreateAlertInput): Promise<AlertRecord> {
  const alert: AlertRecord = {
    ...input,
    id: randomUUID(),
    status: "OPEN",
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
  };

  await updateAlerts((alerts) => [alert, ...alerts].slice(0, 500));

  return alert;
}

export async function createAlertOnce(
  input: CreateAlertInput
): Promise<AlertRecord | null> {
  const alerts = await listAlerts();
  const duplicate = alerts.find((alert) => {
    return (
      alert.status === "OPEN" &&
      alert.type === input.type &&
      alert.thesisRecordId === input.thesisRecordId
    );
  });

  if (duplicate) {
    return null;
  }

  return createAlert(input);
}

export async function acknowledgeAlert(id: string): Promise<AlertRecord | null> {
  let acknowledged: AlertRecord | null = null;

  await updateAlerts((alerts) => {
    return alerts.map((alert) => {
      if (alert.id !== id) {
        return alert;
      }

      acknowledged = {
        ...alert,
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date().toISOString(),
      };

      return acknowledged;
    });
  });

  return acknowledged;
}

async function updateAlerts(
  updater: (alerts: AlertRecord[]) => AlertRecord[]
): Promise<void> {
  const nextWrite = writeQueue.then(async () => {
    const alerts = await listAlerts();
    const nextAlerts = updater(alerts);

    await writeAlerts(nextAlerts);
  });

  writeQueue = nextWrite.catch(() => undefined);

  await nextWrite;
}

async function writeAlerts(alerts: AlertRecord[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const tempPath = path.join(DATA_DIR, `alerts.${randomUUID()}.tmp`);
  await writeFile(tempPath, JSON.stringify(alerts, null, 2));
  await rename(tempPath, ALERTS_PATH);
}
