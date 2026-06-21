import { google } from "googleapis";
import type { WatchlistEntry } from "./watchlist";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_WATCHLIST_SHEET = "Watchlist";
let appendQueue = Promise.resolve();

export type WatchlistSheetRow = {
  dateGenerated: string;
  ticker: string;
  thesis: string;
  confidence: number | string;
  action: string;
  startPrice: number | string;
  entryTrigger: string;
  invalidation: string;
  horizon: string;
  traceId: string;
  status: string;
  notes: string;
};

type SheetsValuesClient = {
  spreadsheets: {
    values: {
      get: (input: {
        spreadsheetId: string;
        range: string;
      }) => Promise<{ data: { values?: unknown[][] | null } }>;
      update: (input: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: { values: unknown[][] };
      }) => Promise<unknown>;
    };
  };
};

type SheetsClient = ReturnType<typeof google.sheets>;

export function buildWatchlistSheetValues(row: WatchlistSheetRow) {
  return [
    row.dateGenerated,
    row.ticker,
    row.thesis,
    row.action,
    row.confidence,
    row.startPrice,
    row.entryTrigger,
    row.invalidation,
    row.horizon,
    row.traceId,
    row.status,
    row.notes,
  ];
}

export async function appendWatchlistRow(row: WatchlistSheetRow) {
  // Environment variables must be read when the request is handled. This
  // module is imported before index.ts calls dotenv.config().
  const { spreadsheetId, keyFile, sheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);
  const quotedSheetName = quoteSheetName(sheetName);

  const nextAppend = appendQueue.then(async () => {
    await appendWatchlistRowWithClient(row, sheets, {
      spreadsheetId,
      quotedSheetName,
    });
  });

  appendQueue = nextAppend.catch(() => undefined);
  await nextAppend;
}

export async function appendWatchlistRowWithClient(
  row: WatchlistSheetRow,
  sheets: SheetsValuesClient,
  config: { spreadsheetId: string; quotedSheetName: string }
) {
  // values.append guesses which table inside a range should receive the
  // row. This sheet also contains a vertical reference table, so that guess
  // can target the wrong area. Resolve the next row from the ticker column
  // and update the real A:L watchlist table explicitly.
  const tickerColumn = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.quotedSheetName}!B2:B`,
  });
  const tickerValues = tickerColumn.data.values ?? [];
  let lastTickerIndex = -1;

  for (let index = tickerValues.length - 1; index >= 0; index -= 1) {
    if (String(tickerValues[index]?.[0] ?? "").trim()) {
      lastTickerIndex = index;
      break;
    }
  }

  const nextRow = lastTickerIndex + 3;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.quotedSheetName}!A${nextRow}:L${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [buildWatchlistSheetValues(row)],
    },
  });
}

export async function updateWatchlistRowStatus(entry: WatchlistEntry) {
  const { spreadsheetId, keyFile, sheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);
  const quotedSheetName = quoteSheetName(sheetName);
  const rowNumber = await findWatchlistSheetRow(sheets, {
    spreadsheetId,
    quotedSheetName,
    entry,
  });

  if (!rowNumber) {
    throw new Error(`No Google Sheets watchlist row found for ${entry.symbol}`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quotedSheetName}!K${rowNumber}:K${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[entry.status]],
    },
  });
}

async function findWatchlistSheetRow(
  sheets: SheetsClient,
  input: {
    spreadsheetId: string;
    quotedSheetName: string;
    entry: WatchlistEntry;
  }
): Promise<number | null> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: `${input.quotedSheetName}!A2:K`,
  });
  const values = response.data.values ?? [];
  const createdDate = input.entry.createdAt.slice(0, 10);

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const row = values[index] ?? [];
    const dateGenerated = String(row[0] ?? "").trim();
    const ticker = String(row[1] ?? "").trim().toUpperCase();
    const traceId = String(row[9] ?? "").trim();

    if (input.entry.traceId && traceId === input.entry.traceId) {
      return index + 2;
    }

    if (ticker === input.entry.symbol && dateGenerated === createdDate) {
      return index + 2;
    }
  }

  return null;
}

function createSheetsClient(keyFile: string): SheetsClient {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [SHEETS_SCOPE],
  });

  return google.sheets({ version: "v4", auth });
}

function getSheetsConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim();
  const sheetName =
    process.env.GOOGLE_SHEETS_WATCHLIST_SHEET?.trim() ||
    DEFAULT_WATCHLIST_SHEET;

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEETS_ID");
  }

  if (!keyFile) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_PATH");
  }

  return { spreadsheetId, keyFile, sheetName };
}

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}
