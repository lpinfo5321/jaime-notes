import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const OUTBOX_BUCKET = "nsf-outbox";

export type OutboxMeta = {
  id: string;
  userId: string;
  name: string;
  size: number;
  year: number;
  status: "uploading" | "pending" | "saved" | "error";
  createdAt: number;
  file?: string;
  error?: string;
  /** PDF viejos del mismo cheque ("2026/NOMBRE.pdf") que la computadora borra al guardar este. */
  replace?: string[];
};

export function outboxAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("El servidor no puede enviar a OneDrive (falta la configuración)");
  return createClient(url, key, { auth: { persistSession: false } });
}

let bucketReady: Promise<void> | null = null;

export function ensureOutboxBucket(admin: SupabaseClient) {
  bucketReady ??= admin.storage
    .createBucket(OUTBOX_BUCKET, { public: false, fileSizeLimit: 52_428_800 })
    .then(() => undefined, () => undefined);
  return bucketReady;
}

export function safeExportName(raw: string) {
  const name = raw.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return name.slice(0, 180);
}
