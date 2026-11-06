import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, ensureOutboxBucket, outboxAdmin, safeExportName, type OutboxMeta } from "@/lib/nsfOutbox";

async function userId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Prepara el envío: el celular sube el PDF directo a la nube y la computadora lo pasa a OneDrive. */
export async function POST(req: NextRequest) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string; size?: number } | null;
  const name = safeExportName(String(body?.name || ""));
  const size = Number(body?.size);
  if (!name || !Number.isFinite(size) || size <= 0 || size > 52_428_800) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }

  const admin = outboxAdmin();
  await ensureOutboxBucket(admin);
  const id = crypto.randomUUID();
  const meta: OutboxMeta = {
    id,
    userId: uid,
    name,
    size,
    year: new Date().getFullYear(),
    status: "uploading",
    createdAt: Date.now(),
  };
  const metaUp = await admin.storage.from(OUTBOX_BUCKET).upload(`${id}/meta.json`, JSON.stringify(meta), {
    contentType: "application/json",
    upsert: true,
  });
  if (metaUp.error) return NextResponse.json({ error: metaUp.error.message }, { status: 500 });

  const signed = await admin.storage.from(OUTBOX_BUCKET).createSignedUploadUrl(`${id}/file`);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message || "No se pudo preparar la subida" }, { status: 500 });
  }
  return NextResponse.json({ id, signedUrl: signed.data.signedUrl });
}

/** El celular pregunta hasta que la computadora confirme que el archivo está en la carpeta. */
export async function GET(req: NextRequest) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });

  const admin = outboxAdmin();
  const got = await admin.storage.from(OUTBOX_BUCKET).download(`${id}/meta.json`);
  if (got.error || !got.data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const meta = JSON.parse(await got.data.text()) as OutboxMeta;
  if (meta.userId !== uid) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ status: meta.status, file: meta.file ?? "", size: meta.size, error: meta.error ?? "" });
}
