import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin } from "@/lib/nsfOutbox";

export const dynamic = "force-dynamic";

/** Abre la copia en la nube de un PDF exportado (la sube el ayudante de la computadora de la oficina). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = String(req.nextUrl.searchParams.get("name") || "").toLowerCase();
  const year = Number(req.nextUrl.searchParams.get("year"));
  try {
    const admin = outboxAdmin();
    const got = await admin.storage.from(OUTBOX_BUCKET).download("_pdf/index.json");
    if (got.error || !got.data) throw new Error("index");
    const idx = JSON.parse(await got.data.text()) as { files?: { name: string; year: number; key?: string }[] };
    const f = (idx.files ?? []).find((x) => x.year === year && x.name.toLowerCase() === name);
    if (!f?.key || !/^_pdf\/files\/\d{4}\/[0-9a-f]{40}\.pdf$/.test(f.key)) {
      return new NextResponse(
        "<meta charset=utf-8><body style='font-family:system-ui;padding:40px;text-align:center'><h2>Este PDF todavía no está disponible</h2><p>La computadora de la oficina lo sube en unos minutos. Vuelve a intentarlo luego.</p></body>",
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    const signed = await admin.storage.from(OUTBOX_BUCKET).createSignedUrl(f.key, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error("sign");
    return NextResponse.redirect(signed.data.signedUrl, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el PDF" }, { status: 500 });
  }
}
