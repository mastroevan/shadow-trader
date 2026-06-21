import dotenv from "dotenv";
import { google } from "googleapis";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeSheetsHorizon,
  normalizeWatchlistStatus,
} from "../src/services/watchlistFields";

dotenv.config();

type WatchlistEntryRecord = {
  id: string;
  symbol: string;
  startPrice?: number | null;
  traceId?: string;
  timeHorizon?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ThesisRecord = {
  symbol: string;
  traceId?: string;
  initialPrice?: number | null;
  thesis?: {
    timeHorizon?: string;
  };
};

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");
const THESES_PATH = path.join(DATA_DIR, "theses.json");
const dryRun = process.argv.includes("--dry-run");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const watchlist = await readJsonArray<WatchlistEntryRecord>(WATCHLIST_PATH);
  const theses = await readJsonArray<ThesisRecord>(THESES_PATH);
  const thesesByTraceId = new Map(
    theses
      .filter((record) => record.traceId)
      .map((record) => [record.traceId, record])
  );
  let localUpdates = 0;

  const repairedWatchlist = watchlist.map((entry) => {
    const thesis = entry.traceId ? thesesByTraceId.get(entry.traceId) : undefined;
    const startPrice =
      typeof entry.startPrice === "number" && Number.isFinite(entry.startPrice)
        ? entry.startPrice
        : typeof thesis?.initialPrice === "number"
          ? thesis.initialPrice
          : null;
    const timeHorizon = normalizeSheetsHorizon(
      entry.timeHorizon ?? thesis?.thesis?.timeHorizon
    );
    const status = normalizeWatchlistStatus(entry.status);
    const updatedEntry = {
      ...entry,
      startPrice,
      timeHorizon,
      status,
      updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    };

    if (
      updatedEntry.startPrice !== entry.startPrice ||
      updatedEntry.timeHorizon !== entry.timeHorizon ||
      updatedEntry.status !== entry.status ||
      updatedEntry.updatedAt !== entry.updatedAt
    ) {
      localUpdates += 1;
    }

    return updatedEntry;
  });

  if (!dryRun && localUpdates > 0) {
    await mkdir(DATA_DIR, { recursive: true });
    const tempPath = path.join(DATA_DIR, `watchlist.repair.${Date.now()}.tmp`);
    await writeFile(tempPath, `${JSON.stringify(repairedWatchlist, null, 2)}\n`);
    await rename(tempPath, WATCHLIST_PATH);
  }

  const sheetUpdates = await repairSheetsRows(repairedWatchlist);

  console.log(
    JSON.stringify(
      {
        dryRun,
        localEntriesScanned: watchlist.length,
        localEntriesUpdated: localUpdates,
        sheetCellsUpdated: sheetUpdates,
      },
      null,
      2
    )
  );
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function repairSheetsRows(entries: WatchlistEntryRecord[]) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim();

  if (!spreadsheetId || !keyFile) {
    return 0;
  }

  const sheetName = process.env.GOOGLE_SHEETS_WATCHLIST_SHEET?.trim() || "Watchlist";
  const quotedSheetName = `'${sheetName.replace(/'/g, "''")}'`;
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quotedSheetName}!A2:L`,
  });
  const rows = response.data.values ?? [];
  const entriesByTraceId = new Map(
    entries
      .filter((entry) => entry.traceId)
      .map((entry) => [entry.traceId, entry])
  );
  let updates = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const traceId = String(row[9] ?? "").trim();
    const entry = entriesByTraceId.get(traceId);

    if (!entry) continue;

    const rowNumber = index + 2;
    const cellUpdates: Array<{ range: string; values: string | number }> = [];

    if (!String(row[5] ?? "").trim() && entry.startPrice != null) {
      cellUpdates.push({ range: `F${rowNumber}:F${rowNumber}`, values: entry.startPrice });
    }

    if (!String(row[8] ?? "").trim()) {
      cellUpdates.push({ range: `I${rowNumber}:I${rowNumber}`, values: entry.timeHorizon ?? "1W" });
    }

    if (!String(row[10] ?? "").trim() || String(row[10]).trim() === "Active") {
      cellUpdates.push({ range: `K${rowNumber}:K${rowNumber}`, values: normalizeWatchlistStatus(entry.status) });
    }

    for (const update of cellUpdates) {
      updates += 1;

      if (dryRun) continue;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${quotedSheetName}!${update.range}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[update.values]],
        },
      });
    }
  }

  return updates;
}
