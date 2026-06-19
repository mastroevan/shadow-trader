import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_WATCHLIST_SHEET = "Watchlist";
let appendQueue = Promise.resolve();

export async function appendWatchlistRow(row: {
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
}) {
  // Environment variables must be read when the request is handled. This
  // module is imported before index.ts calls dotenv.config().
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

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [SHEETS_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const quotedSheetName = `'${sheetName.replace(/'/g, "''")}'`;
  const nextAppend = appendQueue.then(async () => {
    // values.append guesses which table inside a range should receive the
    // row. This sheet also contains a vertical reference table, so that guess
    // can target the wrong area. Resolve the next row from the ticker column
    // and update the real A:L watchlist table explicitly.
    const tickerColumn = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quotedSheetName}!B2:B`,
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
      spreadsheetId,
      range: `${quotedSheetName}!A${nextRow}:L${nextRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
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
          ],
        ],
      },
    });
  });

  appendQueue = nextAppend.catch(() => undefined);
  await nextAppend;
}
