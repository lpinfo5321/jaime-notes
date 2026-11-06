import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin } from "@/lib/nsfOutbox";
import type { LogRow, LogSnapshot } from "@/lib/checkLog";

export const dynamic = "force-dynamic";

const digits = (v: unknown) => String(v ?? "").trim().replace(/^#/, "").replace(/\D/g, "") || String(v ?? "").trim().toUpperCase();
const alnum = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

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
      if (!n.f || n.bucket === "trash" || (n.tags ?? []).includes("__draft")) continue;
      const ck = digits(n.f.checkNumber);
      if (!ck) continue;
      const payor = alnum(n.f.makerPayor || n.f.companyName || n.title);
      byKey.set(`${ck}|${payor}`, n.id);
      byCheck.set(ck, [...(byCheck.get(ck) ?? []), n.id]);
    }
    const rows: LogRow[] = snap.rows.map((r) => {
      const ck = digits(r.F);
      const id = byKey.get(`${ck}|${alnum(r.H)}`) ?? (byCheck.get(ck)?.length === 1 ? byCheck.get(ck)![0] : undefined);
      return id ? { ...r, n: id } : r;
    });
    return NextResponse.json({ snapshot: { ...snap, rows } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el registro" }, { status: 500 });
  }
}
