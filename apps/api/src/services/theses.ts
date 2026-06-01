import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ThesisStatus = "ACTIVE" | "TRIGGERED" | "INVALIDATED" | "EXPIRED" | "RESOLVED";

export type ThesisEvidence = {
  quote: unknown;
  signals: string[];
  signalDetails: unknown[];
  news: unknown[];
  technicals: unknown;
};

export type ThesisOutcome = {
  status: ThesisStatus;
  resolvedAt: string;
  finalPrice: number | null;
  notes: string;
};

export type ThesisAutomationState = {
  lastCheckedAt: string;
  lastPrice: number | null;
  priceChangePct: number | null;
  latestAlertId: string | null;
};

export type ThesisRecord = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  thesis: unknown;
  evidence: ThesisEvidence;
  traceId: string;
  status: ThesisStatus;
  generatedAt: string;
  expiresAt: string;
  initialPrice: number | null;
  outcome: ThesisOutcome | null;
  automation?: ThesisAutomationState;
};

type CreateThesisRecordInput = Omit<
  ThesisRecord,
  "id" | "status" | "generatedAt" | "expiresAt" | "outcome"
> & {
  timeHorizon?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const THESES_PATH = path.join(DATA_DIR, "theses.json");
let writeQueue = Promise.resolve();

export async function listThesisRecords(): Promise<ThesisRecord[]> {
  try {
    const data = await readFile(THESES_PATH, "utf8");
    const records = JSON.parse(data) as ThesisRecord[];

    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export async function getThesisRecord(id: string): Promise<ThesisRecord | null> {
  const records = await listThesisRecords();

  return records.find((record) => record.id === id) ?? null;
}

export async function createThesisRecord(
  input: CreateThesisRecordInput
): Promise<ThesisRecord> {
  const generatedAt = new Date();
  const record: ThesisRecord = {
    ...input,
    id: randomUUID(),
    status: "ACTIVE",
    generatedAt: generatedAt.toISOString(),
    expiresAt: getExpiryDate(generatedAt, input.timeHorizon).toISOString(),
    outcome: null,
  };

  await updateThesisRecords((records) => [record, ...records].slice(0, 250));

  return record;
}

export async function updateThesisOutcome(
  id: string,
  outcome: Omit<ThesisOutcome, "resolvedAt">
): Promise<ThesisRecord | null> {
  let updatedRecord: ThesisRecord | null = null;

  await updateThesisRecords((records) => {
    return records.map((record) => {
      if (record.id !== id) {
        return record;
      }

      updatedRecord = {
        ...record,
        status: outcome.status,
        outcome: {
          ...outcome,
          resolvedAt: new Date().toISOString(),
        },
      };

      return updatedRecord;
    });
  });

  return updatedRecord;
}

export async function updateThesisAutomation(
  id: string,
  automation: ThesisAutomationState
): Promise<ThesisRecord | null> {
  let updatedRecord: ThesisRecord | null = null;

  await updateThesisRecords((records) => {
    return records.map((record) => {
      if (record.id !== id) {
        return record;
      }

      updatedRecord = {
        ...record,
        automation,
      };

      return updatedRecord;
    });
  });

  return updatedRecord;
}

function getExpiryDate(generatedAt: Date, timeHorizon?: string): Date {
  const expiresAt = new Date(generatedAt);
  const normalized = String(timeHorizon ?? "").toUpperCase();

  if (normalized === "1D" || normalized === "SHORT") {
    expiresAt.setDate(expiresAt.getDate() + 1);
  } else if (normalized === "1M" || normalized === "LONG") {
    expiresAt.setDate(expiresAt.getDate() + 30);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 7);
  }

  return expiresAt;
}

async function updateThesisRecords(
  updater: (records: ThesisRecord[]) => ThesisRecord[]
): Promise<void> {
  const nextWrite = writeQueue.then(async () => {
    const records = await listThesisRecords();
    const nextRecords = updater(records);

    await writeThesisRecords(nextRecords);
  });

  writeQueue = nextWrite.catch(() => undefined);

  await nextWrite;
}

async function writeThesisRecords(records: ThesisRecord[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const tempPath = path.join(DATA_DIR, `theses.${randomUUID()}.tmp`);
  await writeFile(tempPath, JSON.stringify(records, null, 2));
  await rename(tempPath, THESES_PATH);
}
