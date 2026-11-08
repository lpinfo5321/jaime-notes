import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin } from "@/lib/nsfOutbox";
import { logRowKey, type LogSnapshot } from "@/lib/checkLog";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** Filas del registro (número de fila del Excel). */
  rows: z.array(z.number().int().positive()).max(200).optional(),
  /** Reportes ya eliminados: se buscan sus filas por # de cheque + compañía. */
  notes: z.array(z.object({ check: z.string(), payor: z.string() })).max(200).optional(),
  /** Solo contar cuántas filas se podrían quitar (no pide nada). */
  dryRun: z.boolean().optional(),
});

/**
 * Pide al ayudante de la computadora que quite filas del Excel del registro.
 * Solo filas que escribió la app y cuyo reporte ya no existe en la app.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { rows = [], notes = [], dryRun = false } = parsed.data;

  try {
    const admin = outboxAdmin();
    const [snapRes, notesRes] = await Promise.all([
      admin.storage.from(OUTBOX_BUCKET).download("_log/snapshot.json"),
      supabase.from("notes").select("id,title,tags,f:values->_report->payload->fields").limit(5000),
    ]);
    if (snapRes.error || !snapRes.data) return NextResponse.json({ error: "Todavía no hay registro" }, { status: 409 });
    const snap = JSON.parse(await snapRes.data.text()) as LogSnapshot;

    // Reportes que todavía existen (cualquier pestaña, incluida la papelera): sus filas NO se quitan.
    const liveKeys = new Set<string>();
    for (const n of (notesRes.data ?? []) as unknown as { title: string | null; tags: string[] | null; f: Record<string, unknown> | null }[]) {
      if (!n.f || (n.tags ?? []).includes("__draft")) continue;
      const k = logRowKey(n.f.checkNumber, n.f.makerPayor || n.f.companyName || n.title);
      if (!k.startsWith("|")) liveKeys.add(k);
    }

    const wantKeys = new Set(notes.map((n) => logRowKey(n.check, n.payor)).filter((k) => !k.startsWith("|")));
    const wantRows = new Set(rows);
    const picked: { r: number; key: string }[] = [];
    let blocked = 0;
    for (const r of snap.rows) {
      const key = logRowKey(r.F, r.H);
      if (!wantRows.has(r.r) && !wantKeys.has(key)) continue;
      if (!r.a || liveKeys.has(key)) {
        blocked += 1;
        continue;
      }
      picked.push({ r: r.r, key });
    }
    if (!picked.length || dryRun) return NextResponse.json({ ok: true, count: picked.length, blocked });

    const name = `_log/del/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const up = await admin.storage
      .from(OUTBOX_BUCKET)
      .upload(name, JSON.stringify({ at: new Date().toISOString(), userId: u.user.id, rows: picked }), {
        contentType: "application/json",
        upsert: false,
      });
    if (up.error) throw new Error(up.error.message);
    return NextResponse.json({ ok: true, count: picked.length, blocked, rows: picked.map((p) => p.r) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo pedir el cambio" }, { status: 500 });
  }
}
