import assert from "node:assert/strict";
import test from "node:test";
import {
  appendWatchlistRowWithClient,
  buildWatchlistSheetValues,
  type WatchlistSheetRow,
} from "./googleSheets";

const row: WatchlistSheetRow = {
  dateGenerated: "2026-06-20",
  ticker: "NVDA",
  thesis: "BULLISH",
  action: "WATCH",
  confidence: 0.72,
  startPrice: 210.69,
  entryTrigger: "Break above trend",
  invalidation: "Close below open",
  horizon: "SHORT",
  traceId: "trace-123",
  status: "Watching",
  notes: "Volume confirmation; Follow-through",
};

test("buildWatchlistSheetValues maps watchlist fields to A:L order", () => {
  assert.deepEqual(buildWatchlistSheetValues(row), [
    "2026-06-20",
    "NVDA",
    "BULLISH",
    "WATCH",
    0.72,
    210.69,
    "Break above trend",
    "Close below open",
    "SHORT",
    "trace-123",
    "Watching",
    "Volume confirmation; Follow-through",
  ]);
});

test("appendWatchlistRowWithClient updates an existing ticker row", async () => {
  const calls: unknown[] = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async (input: unknown) => {
          calls.push({ method: "get", input });

          return {
            data: {
              values: [["NVDA"], [""], ["AAPL"]],
            },
          };
        },
        update: async (input: unknown) => {
          calls.push({ method: "update", input });

          return { data: {} };
        },
      },
    },
  };

  await appendWatchlistRowWithClient(row, sheets, {
    spreadsheetId: "sheet-id",
    quotedSheetName: "'Watchlist'",
  });

  assert.deepEqual(calls, [
    {
      method: "get",
      input: {
        spreadsheetId: "sheet-id",
        range: "'Watchlist'!B2:B",
      },
    },
    {
      method: "update",
      input: {
        spreadsheetId: "sheet-id",
        range: "'Watchlist'!A2:L2",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildWatchlistSheetValues(row)],
        },
      },
    },
  ]);
});
