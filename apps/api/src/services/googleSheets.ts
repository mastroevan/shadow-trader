import { google } from "googleapis";
import type { LedgerEntry, TradeEntry, WatchlistEntry } from "./watchlist";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_WATCHLIST_SHEET = "Watchlist";
const DEFAULT_TRADE_LIST_SHEET = "Trades";
const DEFAULT_TRUST_LEDGER_SHEET = "Daily Review";
const REQUIRED_WORKFLOW_SHEETS = [
  DEFAULT_WATCHLIST_SHEET,
  DEFAULT_TRADE_LIST_SHEET,
  DEFAULT_TRUST_LEDGER_SHEET,
] as const;
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

export async function upsertWatchlistRow(row: WatchlistSheetRow) {
  // Environment variables must be read when the request is handled. This
  // module is imported before index.ts calls dotenv.config().
  const { spreadsheetId, keyFile, sheetName, tradeListSheetName, trustLedgerSheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);
  const quotedSheetName = quoteSheetName(sheetName);

  const nextAppend = appendQueue.then(async () => {
    await verifyWorkflowSheets(sheets, spreadsheetId, [
      sheetName,
      tradeListSheetName,
      trustLedgerSheetName,
    ]);
    await upsertWatchlistRowWithClient(row, sheets, {
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
  await upsertWatchlistRowWithClient(row, sheets, config);
}

export async function upsertWatchlistRowWithClient(
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
  const ticker = row.ticker.trim().toUpperCase();
  let lastTickerIndex = -1;
  let matchingTickerIndex = -1;

  for (let index = tickerValues.length - 1; index >= 0; index -= 1) {
    const value = String(tickerValues[index]?.[0] ?? "").trim().toUpperCase();
    if (value === ticker) {
      matchingTickerIndex = index;
    }

    if (value && lastTickerIndex === -1) {
      lastTickerIndex = index;
    }
  }

  const nextRow = matchingTickerIndex >= 0 ? matchingTickerIndex + 2 : lastTickerIndex + 3;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.quotedSheetName}!A${nextRow}:L${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [buildWatchlistSheetValues(row)],
    },
  });
}

export async function moveWatchlistRowToTradeList(entry: TradeEntry) {
  const { spreadsheetId, keyFile, sheetName, tradeListSheetName, trustLedgerSheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);
  const activeSheetName = quoteSheetName(sheetName);
  const tradeSheetName = quoteSheetName(tradeListSheetName);

  await verifyWorkflowSheets(sheets, spreadsheetId, [sheetName, tradeListSheetName, trustLedgerSheetName]);
  await appendTableRow(sheets, {
    spreadsheetId,
    quotedSheetName: tradeSheetName,
    values: buildTradeListSheetValues(entry),
    columns: "A:R",
  });
  await clearWatchlistRow(sheets, { spreadsheetId, quotedSheetName: activeSheetName, entry });
}

export async function moveWatchlistRowToLedger(entry: LedgerEntry) {
  const { spreadsheetId, keyFile, sheetName, tradeListSheetName, trustLedgerSheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);
  const activeSheetName = quoteSheetName(sheetName);
  const ledgerSheetName = quoteSheetName(trustLedgerSheetName);

  await verifyWorkflowSheets(sheets, spreadsheetId, [sheetName, tradeListSheetName, trustLedgerSheetName]);
  await appendTableRow(sheets, {
    spreadsheetId,
    quotedSheetName: ledgerSheetName,
    values: buildLedgerSheetValues(entry),
    columns: "A:U",
  });
  await clearWatchlistRow(sheets, { spreadsheetId, quotedSheetName: activeSheetName, entry });
}

export async function appendClosedTradeToLedger(entry: LedgerEntry) {
  const { spreadsheetId, keyFile, sheetName, tradeListSheetName, trustLedgerSheetName } = getSheetsConfig();
  const sheets = createSheetsClient(keyFile);

  await verifyWorkflowSheets(sheets, spreadsheetId, [sheetName, tradeListSheetName, trustLedgerSheetName]);
  await appendTableRow(sheets, {
    spreadsheetId,
    quotedSheetName: quoteSheetName(trustLedgerSheetName),
    values: buildLedgerSheetValues(entry),
    columns: "A:U",
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

function buildTradeListSheetValues(entry: TradeEntry) {
  return [
    entry.createdAt.slice(0, 10),
    entry.symbol,
    entry.thesis,
    entry.direction,
    entry.confidenceScore ?? "",
    entry.startPrice ?? "",
    entry.entryTrigger,
    entry.invalidation,
    entry.timeHorizon,
    entry.traceId ?? "",
    entry.status,
    entry.watchConditions.join("; "),
    entry.entryDate ?? "",
    entry.entryPrice ?? "",
    entry.currentPrice ?? "",
    entry.currentProfitLoss ?? "",
    entry.currentProfitLossPercent ?? "",
    entry.notes,
  ];
}

function buildLedgerSheetValues(entry: LedgerEntry) {
  return [
    entry.recordType,
    entry.symbol,
    entry.thesis,
    entry.traceId ?? "",
    entry.startPrice ?? "",
    entry.invalidationReason ?? "",
    entry.dateInvalidated ?? "",
    entry.expirationDate ?? "",
    entry.entryDate ?? "",
    entry.entryPrice ?? "",
    entry.exitDate ?? "",
    entry.exitPrice ?? "",
    entry.profitLoss ?? "",
    entry.profitLossPercent ?? "",
    entry.outcome ?? "",
    entry.notes ?? "",
    entry.direction,
    entry.confidenceScore ?? "",
    entry.entryTrigger,
    entry.timeHorizon,
    entry.updatedAt,
  ];
}

async function appendTableRow(
  sheets: SheetsValuesClient,
  input: {
    spreadsheetId: string;
    quotedSheetName: string;
    values: unknown[];
    columns: string;
  }
) {
  const firstColumn = await sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: `${input.quotedSheetName}!A2:A`,
  });
  const values = firstColumn.data.values ?? [];
  let lastIndex = -1;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (String(values[index]?.[0] ?? "").trim()) {
      lastIndex = index;
      break;
    }
  }

  const nextRow = lastIndex + 3;
  const endColumn = input.columns.split(":")[1];

  await sheets.spreadsheets.values.update({
    spreadsheetId: input.spreadsheetId,
    range: `${input.quotedSheetName}!A${nextRow}:${endColumn}${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [input.values] },
  });
}

async function clearWatchlistRow(
  sheets: SheetsClient,
  input: {
    spreadsheetId: string;
    quotedSheetName: string;
    entry: WatchlistEntry;
  }
) {
  const rowNumber = await findWatchlistSheetRow(sheets, input);
  if (!rowNumber) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: input.spreadsheetId,
    range: `${input.quotedSheetName}!A${rowNumber}:L${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [Array(12).fill("")] },
  });
}

async function verifyWorkflowSheets(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetNames: string[]
) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const existingTitles = new Set(
    (spreadsheet.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
  );
  const missingSheetNames = sheetNames.filter((sheetName) => !existingTitles.has(sheetName));

  if (missingSheetNames.length === 0) return;

  throw new Error(`Missing required Google Sheets tab(s): ${missingSheetNames.join(", ")}`);
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
  const sheetName = getRequiredSheetName(
    process.env.GOOGLE_SHEETS_WATCHLIST_SHEET,
    DEFAULT_WATCHLIST_SHEET,
    "GOOGLE_SHEETS_WATCHLIST_SHEET"
  );
  const tradeListSheetName = getRequiredSheetName(
    process.env.GOOGLE_SHEETS_TRADE_LIST_SHEET,
    DEFAULT_TRADE_LIST_SHEET,
    "GOOGLE_SHEETS_TRADE_LIST_SHEET"
  );
  const trustLedgerSheetName = getRequiredSheetName(
    process.env.GOOGLE_SHEETS_TRUST_LEDGER_SHEET,
    DEFAULT_TRUST_LEDGER_SHEET,
    "GOOGLE_SHEETS_TRUST_LEDGER_SHEET"
  );

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEETS_ID");
  }

  if (!keyFile) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_PATH");
  }

  return { spreadsheetId, keyFile, sheetName, tradeListSheetName, trustLedgerSheetName };
}

function getRequiredSheetName(value: string | undefined, requiredSheetName: string, envName: string) {
  const sheetName = value?.trim() || requiredSheetName;

  if (sheetName !== requiredSheetName) {
    throw new Error(
      `${envName} must be "${requiredSheetName}". Shadow Trader only writes to ${REQUIRED_WORKFLOW_SHEETS.join(", ")}.`
    );
  }

  return sheetName;
}

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}
