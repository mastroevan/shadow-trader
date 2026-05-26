import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type WatchlistEntry = {
  id: string;
  symbol: string;
  direction: string;
  suggestedAction: string;
  confidenceScore: number | null;
  thesis: string;
  entryTrigger: string;
  invalidation: string;
  watchConditions: string[];
  traceId?: string;
  createdAt: string;
};

type CreateWatchlistEntryInput = Omit<WatchlistEntry, "id" | "createdAt">;

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");

export async function listWatchlistEntries(): Promise<WatchlistEntry[]> {
  try {
    const data = await readFile(WATCHLIST_PATH, "utf8");
    const entries = JSON.parse(data) as WatchlistEntry[];

    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export async function createWatchlistEntry(
  input: CreateWatchlistEntryInput
): Promise<WatchlistEntry> {
  const entries = await listWatchlistEntries();
  const entry: WatchlistEntry = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(WATCHLIST_PATH, JSON.stringify([entry, ...entries], null, 2));

  return entry;
}

export async function deleteWatchlistEntry(id: string): Promise<boolean> {
  const entries = await listWatchlistEntries();
  const nextEntries = entries.filter((entry) => entry.id !== id);

  if (nextEntries.length === entries.length) {
    return false;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(WATCHLIST_PATH, JSON.stringify(nextEntries, null, 2));

  return true;
}
