import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Límites aproximados del plan GRATIS de Supabase (confirmar siempre en el panel de Supabase). */
const FREE = {
  dbBytes: 500 * MB,
  storageBytes: 1 * GB,
  fileMaxBytes: 50 * MB,
  egressBytesMonth: 5 * GB,
  monthlyActiveUsers: 50_000,
  realtimeConnections: 200,
};

function jsonBytes(v: unknown): number {
  try {
    return v == null ? 0 : JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  const [notesRes, attRes, docsRes, contactsRes, tplRes] = await Promise.all([
    supabase.from("notes").select("created_at,title,body,values,template_snapshot").limit(5000),
    supabase.from("attachments").select("size,created_at").limit(20000),
    supabase.from("documents").select("size,created_at").limit(5000),
    supabase.from("contacts").select("name,phones,email,company,notes,created_at").limit(5000),
    supabase.from("templates").select("id").limit(1000),
  ]);
  const latencyMs = Date.now() - t0;

  const notes = (notesRes.data ?? []) as any[];
  const atts = (attRes.data ?? []) as any[];
  const docs = (docsRes.data ?? []) as any[];
  const contacts = (contactsRes.data ?? []) as any[];

  // Base de datos: texto real de lo que guardas (el panel de Supabase suma además el sistema e índices).
  let dbBytes = 0;
  for (const n of notes) dbBytes += jsonBytes(n.values) + jsonBytes(n.template_snapshot) + (n.body?.length ?? 0) + (n.title?.length ?? 0) + 200;
  for (const c of contacts) dbBytes += jsonBytes(c) + 100;
  dbBytes = Math.round(dbBytes * 1.35); // índices y sobrecarga (estimado)

  const attBytes = atts.reduce((s, a) => s + Number(a.size ?? 0), 0);
  const docBytes = docs.reduce((s, d) => s + Number(d.size ?? 0), 0);
  const storageBytes = attBytes + docBytes;
  const largest = Math.max(0, ...atts.map((a) => Number(a.size ?? 0)), ...docs.map((d) => Number(d.size ?? 0)));

  const dates = [...notes, ...atts, ...docs]
    .map((x) => (x.created_at ? new Date(x.created_at).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const firstAt = dates.length ? Math.min(...dates) : Date.now();
  const days = Math.max(30, (Date.now() - firstAt) / 86_400_000);

  const storagePerDay = storageBytes / days;
  const dbPerDay = dbBytes / days;
  const daysToFull = (used: number, limit: number, perDay: number) =>
    perDay > 0 ? Math.max(0, Math.round((limit - used) / perDay)) : null;

  return NextResponse.json({
    ok: !notesRes.error,
    latencyMs,
    limits: FREE,
    usage: {
      dbBytes,
      storageBytes,
      attachmentsBytes: attBytes,
      documentsBytes: docBytes,
      largestFileBytes: largest,
    },
    counts: {
      reports: notes.length,
      contacts: contacts.length,
      documents: docs.length,
      attachments: atts.length,
      templates: (tplRes.data ?? []).length,
    },
    projection: {
      trackedDays: Math.round(days),
      storageDaysToFull: daysToFull(storageBytes, FREE.storageBytes, storagePerDay),
      dbDaysToFull: daysToFull(dbBytes, FREE.dbBytes, dbPerDay),
    },
    errors: [notesRes.error, attRes.error, docsRes.error, contactsRes.error].filter(Boolean).map((e) => e!.message),
  });
}
