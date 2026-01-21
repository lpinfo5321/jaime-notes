import { setSyncSnapshot } from "@/lib/syncStatus";

type QueueFile = {
  v: 1;
  items: Record<
    string,
    {
      noteId: string;
      payload: unknown;
      queuedAt: string;
    }
  >;
};

const KEY = "rc:reportQueue:v1";

function readQueueFile(): QueueFile {
  if (typeof window === "undefined") return { v: 1, items: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { v: 1, items: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.items !== "object" || !parsed.items)
      return { v: 1, items: {} };
    return parsed as QueueFile;
  } catch {
    return { v: 1, items: {} };
  }
}

function writeQueueFile(next: QueueFile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore (storage might be blocked)
  }
}

export function getQueuedReportsCount(): number {
  try {
    return Object.keys(readQueueFile().items ?? {}).length;
  } catch {
    return 0;
  }
}

function syncCountToGlobal() {
  setSyncSnapshot({ queuedReports: getQueuedReportsCount() });
}

export function enqueueReport(noteId: string, payload: unknown) {
  if (!noteId) return;
  const file = readQueueFile();
  file.items[noteId] = { noteId, payload, queuedAt: new Date().toISOString() };
  writeQueueFile(file);
  syncCountToGlobal();
}

export function removeQueuedReport(noteId: string) {
  if (!noteId) return;
  const file = readQueueFile();
  if (!file.items[noteId]) return;
  delete file.items[noteId];
  writeQueueFile(file);
  syncCountToGlobal();
}

export function getQueuedReport(noteId: string) {
  const file = readQueueFile();
  return file.items?.[noteId] ?? null;
}

export async function flushQueuedReportsOnce(opts?: {
  onlyNoteId?: string;
}): Promise<{ flushedNoteIds: string[]; remaining: number }> {
  if (typeof window === "undefined") return { flushedNoteIds: [], remaining: 0 };
  const online = (() => {
    try {
      return !!navigator.onLine;
    } catch {
      return true;
    }
  })();
  if (!online) {
    syncCountToGlobal();
    return { flushedNoteIds: [], remaining: getQueuedReportsCount() };
  }

  const file = readQueueFile();
  const ids = Object.keys(file.items ?? {});
  const targetIds = opts?.onlyNoteId ? ids.filter((id) => id === opts.onlyNoteId) : ids;
  const flushed: string[] = [];

  for (const noteId of targetIds) {
    const item = file.items[noteId];
    if (!item) continue;
    try {
      const res = await fetch(`/api/notes/${noteId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: item.payload }),
      });
      if (!res.ok) continue;
      flushed.push(noteId);
      delete file.items[noteId];
      writeQueueFile(file);
    } catch {
      // keep in queue
    }
  }

  syncCountToGlobal();
  return { flushedNoteIds: flushed, remaining: getQueuedReportsCount() };
}

