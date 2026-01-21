/* Pequeño bus global de estado "Guardado / Sin conexión" (sin dependencias). */

export type SyncSnapshot = {
  online: boolean;
  queuedReports: number;
  saving: boolean;
  state: "idle" | "saving" | "saved" | "queued" | "error";
  lastSavedAt?: string | null;
  lastSavedBy?: string | null;
};

const EVENT_NAME = "rc:syncStatusChanged";

function safeOnline(): boolean {
  try {
    return typeof navigator !== "undefined" ? !!navigator.onLine : true;
  } catch {
    return true;
  }
}

function readGlobal(): SyncSnapshot | null {
  try {
    return (globalThis as any).__rc_syncStatus ?? null;
  } catch {
    return null;
  }
}

export function getSyncSnapshot(): SyncSnapshot {
  const prev = readGlobal();
  if (prev) return prev;
  return {
    online: safeOnline(),
    queuedReports: 0,
    saving: false,
    state: "idle",
    lastSavedAt: null,
    lastSavedBy: null,
  };
}

export function setSyncSnapshot(patch: Partial<SyncSnapshot>) {
  const prev = getSyncSnapshot();
  const next: SyncSnapshot = {
    ...prev,
    ...patch,
    online: typeof patch.online === "boolean" ? patch.online : prev.online,
    queuedReports:
      typeof patch.queuedReports === "number" ? patch.queuedReports : prev.queuedReports,
    saving: typeof patch.saving === "boolean" ? patch.saving : prev.saving,
    state: (patch.state ?? prev.state) as SyncSnapshot["state"],
  };
  try {
    (globalThis as any).__rc_syncStatus = next;
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    }
  } catch {
    // ignore
  }
}

export function subscribeSyncSnapshot(cb: (s: SyncSnapshot) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (ev: any) => {
    try {
      cb((ev?.detail ?? getSyncSnapshot()) as SyncSnapshot);
    } catch {
      cb(getSyncSnapshot());
    }
  };
  try {
    window.addEventListener(EVENT_NAME as any, handler as any);
  } catch {
    // ignore
  }
  // Emit immediately
  try {
    cb(getSyncSnapshot());
  } catch {
    // ignore
  }
  return () => {
    try {
      window.removeEventListener(EVENT_NAME as any, handler as any);
    } catch {
      // ignore
    }
  };
}

