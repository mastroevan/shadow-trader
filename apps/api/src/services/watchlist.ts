import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  normalizeSheetsHorizon,
  normalizeWatchlistStatus,
  type WatchlistStatus,
} from "./watchlistFields";

export type WatchlistEntry = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  startPrice: number | null;
  thesis: string;
  entryTrigger: string;
  invalidation: string;
  watchConditions: string[];
  traceId?: string;
  timeHorizon: string;
  status: WatchlistStatus;
  createdAt: string;
  updatedAt: string;
};

type CreateWatchlistEntryInput = Omit<
  WatchlistEntry,
  "id" | "createdAt" | "updatedAt"
>;

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");
let writeQueue = Promise.resolve();

export async function listWatchlistEntries(): Promise<WatchlistEntry[]> {
  try {
    const data = await readFile(WATCHLIST_PATH, "utf8");
    const entries = JSON.parse(data) as WatchlistEntry[];

    return Array.isArray(entries) ? entries.map(normalizeStoredEntry) : [];
  } catch {
    return [];
  }
}

export async function createWatchlistEntry(
  input: CreateWatchlistEntryInput
): Promise<WatchlistEntry> {
  const entry: WatchlistEntry = {
    ...input,
    status: normalizeWatchlistStatus(input.status),
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await updateWatchlistEntries((entries) => [entry, ...entries]);

  return entry;
}

export async function updateWatchlistEntryStatus(
  id: string,
  status: WatchlistStatus
): Promise<WatchlistEntry | null> {
  let updatedEntry: WatchlistEntry | null = null;

  await updateWatchlistEntries((entries) => {
    return entries.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      updatedEntry = {
        ...entry,
        status,
        updatedAt: new Date().toISOString(),
      };

      return updatedEntry;
    });
  });

  return updatedEntry;
}

export async function deleteWatchlistEntry(id: string): Promise<boolean> {
  let deleted = false;

  await updateWatchlistEntries((entries) => {
    const nextEntries = entries.filter((entry) => entry.id !== id);
    deleted = nextEntries.length !== entries.length;

    return nextEntries;
  });

  return deleted;
}

function normalizeStoredEntry(entry: WatchlistEntry): WatchlistEntry {
  const createdAt = entry.createdAt ?? new Date().toISOString();

  return {
    ...entry,
    startPrice:
      typeof entry.startPrice === "number" && Number.isFinite(entry.startPrice)
        ? entry.startPrice
        : null,
    watchConditions: Array.isArray(entry.watchConditions)
      ? entry.watchConditions.map(String)
      : [],
    timeHorizon: normalizeSheetsHorizon(entry.timeHorizon),
    status: normalizeWatchlistStatus(entry.status),
    createdAt,
    updatedAt: entry.updatedAt ?? createdAt,
  };
}

async function updateWatchlistEntries(
  updater: (entries: WatchlistEntry[]) => WatchlistEntry[]
): Promise<void> {
  const nextWrite = writeQueue.then(async () => {
    const entries = await listWatchlistEntries();
    const nextEntries = updater(entries);

    await writeWatchlistEntries(nextEntries);
  });

  writeQueue = nextWrite.catch(() => undefined);

  await nextWrite;
}

async function writeWatchlistEntries(entries: WatchlistEntry[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const tempPath = path.join(DATA_DIR, `watchlist.${randomUUID()}.tmp`);
  await writeFile(tempPath, JSON.stringify(entries, null, 2));
  await rename(tempPath, WATCHLIST_PATH);
}
