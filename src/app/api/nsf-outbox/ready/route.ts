import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin, type OutboxMeta } from "@/lib/nsfOutbox";

/** Marca el PDF como listo solo si llegó completo. A partir de ahí la computadora puede copiarlo a OneDrive. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });

  const admin = outboxAdmin();
  const got = await admin.storage.from(OUTBOX_BUCKET).download(`${id}/meta.json`);
  if (got.error || !got.data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const meta = JSON.parse(await got.data.text()) as OutboxMeta;
  if (meta.userId !== uid) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const listed = await admin.storage.from(OUTBOX_BUCKET).list(id, { limit: 10 });
  const file = (listed.data ?? []).find((item) => item.name === "file");
  const size = Number(file?.metadata?.size ?? 0);
  if (!file || size !== meta.size) {
    return NextResponse.json({ error: "El archivo no llegó completo. Vuelve a exportar." }, { status: 409 });
  }

  meta.status = "pending";
  const up = await admin.storage.from(OUTBOX_BUCKET).upload(`${id}/meta.json`, JSON.stringify(meta), {
    contentType: "application/json",
    upsert: true,
  });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
