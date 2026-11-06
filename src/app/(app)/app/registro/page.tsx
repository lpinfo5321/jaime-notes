import { outboxAdmin, OUTBOX_BUCKET } from "@/lib/nsfOutbox";
import type { LogSnapshot } from "@/lib/checkLog";
import LogView from "@/components/log/LogView";

export const dynamic = "force-dynamic";

async function loadSnapshot(): Promise<{ snap: LogSnapshot | null; error: string | null }> {
  try {
    const admin = outboxAdmin();
    const { data, error } = await admin.storage.from(OUTBOX_BUCKET).download("_log/snapshot.json");
    if (error || !data) return { snap: null, error: null };
    return { snap: JSON.parse(await data.text()) as LogSnapshot, error: null };
  } catch (e) {
    return { snap: null, error: e instanceof Error ? e.message : "No se pudo cargar el registro" };
  }
}

export default async function RegistroPage() {
  const { snap, error } = await loadSnapshot();
  return <LogView snapshot={snap} loadError={error} />;
}
