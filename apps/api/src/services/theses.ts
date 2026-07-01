import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type ThesisStatus = "ACTIVE" | "TRIGGERED" | "INVALIDATED" | "EXPIRED";

export type ThesisEvidence = {
  quote: unknown;
  candles?: unknown[];
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
};

type CreateThesisRecordInput = Omit<
  ThesisRecord,
  "id" | "status" | "generatedAt" | "expiresAt" | "outcome"
> & {
  timeHorizon?: string;
};

export async function listThesisRecords(): Promise<ThesisRecord[]> {
  const db = await getDb();
  const rows = await db.thesisRecord.findMany({
    orderBy: {
      generatedAt: "desc",
    },
    take: 250,
  });

  return rows.map((row) => parsePayload<ThesisRecord>(row.payloadJson));
}

export async function getThesisRecord(id: string): Promise<ThesisRecord | null> {
  const db = await getDb();
  const row = await db.thesisRecord.findUnique({
    where: { id },
  });

  return row ? parsePayload<ThesisRecord>(row.payloadJson) : null;
}

export async function createThesisRecord(
  input: CreateThesisRecordInput
): Promise<ThesisRecord> {
  const db = await getDb();
  const generatedAt = new Date();
  const record: ThesisRecord = {
    ...input,
    id: randomUUID(),
    status: "ACTIVE",
    generatedAt: generatedAt.toISOString(),
    expiresAt: getExpiryDate(generatedAt, input.timeHorizon).toISOString(),
    outcome: null,
  };

  await db.thesisRecord.create({
    data: {
      id: record.id,
      symbol: record.symbol.toUpperCase(),
      status: record.status,
      payloadJson: JSON.stringify(record),
      generatedAt,
      updatedAt: generatedAt,
    },
  });

  return record;
}

export async function updateThesisOutcome(
  id: string,
  outcome: Omit<ThesisOutcome, "resolvedAt">
): Promise<ThesisRecord | null> {
  const db = await getDb();
  const row = await db.thesisRecord.findUnique({
    where: { id },
  });

  if (!row) return null;

  const current = parsePayload<ThesisRecord>(row.payloadJson);
  const updatedRecord: ThesisRecord = {
    ...current,
    status: outcome.status,
    outcome: {
      ...outcome,
      resolvedAt: new Date().toISOString(),
    },
  };

  await db.thesisRecord.update({
    where: { id },
    data: {
      status: updatedRecord.status,
      payloadJson: JSON.stringify(updatedRecord),
      updatedAt: new Date(),
    },
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

function parsePayload<T>(payloadJson: string): T {
  return JSON.parse(payloadJson) as T;
}
