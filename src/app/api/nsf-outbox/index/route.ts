import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOX_BUCKET, outboxAdmin } from "@/lib/nsfOutbox";

export const dynamic = "force-dynamic";

/** Lista de PDF que ya están en la carpeta de OneDrive (la sube el ayudante de la computadora). */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const got = await outboxAdmin().storage.from(OUTBOX_BUCKET).download("_pdf/index.json");
    if (got.error || !got.data) return NextResponse.json({ files: null });
    const j = JSON.parse(await got.data.text()) as { at?: number; files?: unknown };
    return NextResponse.json({ at: j.at ?? null, files: Array.isArray(j.files) ? j.files : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ files: null });
  }
}
