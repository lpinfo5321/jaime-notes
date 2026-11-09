import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin } from "@/lib/nsfOutbox";
import type { LogRow, LogSnapshot } from "@/lib/checkLog";

export const dynamic = "force-dynamic";

const digits = (v: unknown) =>
  String(v ?? "").trim().replace(/^#/, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "") || String(v ?? "").trim().toUpperCase();
const alnum = (v: unknown) => String(v ?? "").toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]/g, "");

/** Registro (copia del Excel) + enlace a cada reporte que todavía existe en la app. */
export async function GET() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = outboxAdmin();
    const [snapRes, notesRes] = await Promise.all([
      admin.storage.from(OUTBOX_BUCKET).download("_log/snapshot.json"),
      supabase
        .from("notes")
        .select("id,title,tags,f:values->_report->payload->fields,bucket:values->>_bucket")
        .limit(2000),
    ]);
    if (snapRes.error || !snapRes.data) return NextResponse.json({ snapshot: null });
    const snap = JSON.parse(await snapRes.data.text()) as LogSnapshot;

    const byKey = new Map<string, string>();
    const byCheck = new Map<string, string[]>();
    for (const n of (notesRes.data ?? []) as unknown as { id: string; title: string | null; tags: string[] | null; f: Record<string, unknown> | null; bucket: string | null }[]) {
      if (!n.f || n.bucket === "trash" || (n.tags ?? []).includes("__draft") || (n.tags ?? []).includes("__practice")) continue;
      const ck = digits(n.f.checkNumber);
      if (!ck) continue;
      const payor = alnum(n.f.makerPayor || n.f.companyName || n.title);
      byKey.set(`${ck}|${payor}`, n.id);
      byCheck.set(ck, [...(byCheck.get(ck) ?? []), n.id]);
    }
    // Filas con pedido de "quitar" que la computadora todavía no aplica
    const pendingDel = new Set<number>();
    try {
      const listed = await admin.storage.from(OUTBOX_BUCKET).list("_log/del", { limit: 200 });
      const files = (listed.data ?? []).filter((it) => it.id && it.name.endsWith(".json"));
      await Promise.all(
        files.map(async (it) => {
          const dl = await admin.storage.from(OUTBOX_BUCKET).download(`_log/del/${it.name}`);
          if (dl.error || !dl.data) return;
          const j = JSON.parse(await dl.data.text()) as { rows?: { r: number }[] };
          for (const r of j.rows ?? []) pendingDel.add(Number(r.r));
        }),
      );
    } catch {}
    const rows: LogRow[] = snap.rows.map((r) => {
      const ck = digits(r.F);
      const id = byKey.get(`${ck}|${alnum(r.H)}`) ?? (byCheck.get(ck)?.length === 1 ? byCheck.get(ck)![0] : undefined);
      const out: LogRow = id ? { ...r, n: id } : r;
      return pendingDel.has(r.r) ? { ...out, x: true } : out;
    });
    return NextResponse.json({ snapshot: { ...snap, rows } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el registro" }, { status: 500 });
  }
}
