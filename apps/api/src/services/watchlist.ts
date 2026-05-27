import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
let writeQueue = Promise.resolve();

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
  const entry: WatchlistEntry = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await updateWatchlistEntries((entries) => [entry, ...entries]);

  return entry;
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
