import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// IMPORTANTE (Vercel/CDN): este endpoint no debe cachearse.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z
  .object({
    payload: z.unknown(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: note, error } = await supabase
    .from("notes")
    .select("values")
    .eq("id", id)
    .single();

  if (error || !note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const v = (note.values ?? {}) as any;
  const payload = v?._report?.payload ?? null;
  const updatedAt = v?._report?.updatedAt ?? null;
  const updatedBy = v?._report?.updatedBy ?? null;
  const history = Array.isArray(v?._report?.history) ? v._report.history : null;
  const historyCount = Array.isArray(history) ? history.length : 0;

  // Rehidratar URLs firmadas para que el iframe pueda mostrar imágenes guardadas (path-only).
  // Recovery: si `payload.images` está vacío pero sí hay imágenes en `attachments`,
  // reconstruimos el array desde la tabla para evitar "Imágenes 0" aunque ya existan adjuntos.
  // NO muta lo guardado en DB; solo en la respuesta.
  try {
    const payloadImgs = Array.isArray(payload?.images) ? (payload.images as any[]) : [];
    let imgs = payloadImgs;

    if (!imgs.length) {
      const { data: atts } = await supabase
        .from("attachments")
        .select("path,filename,mime_type,created_at")
        .eq("note_id", id)
        .order("created_at", { ascending: true })
        .limit(200);

      const recovered = (atts ?? [])
        .filter((a: any) => String(a?.mime_type ?? "").startsWith("image/"))
        .map((a: any) => {
          const path = typeof a?.path === "string" ? a.path.trim() : "";
          if (!path) return null;
          const filename =
            typeof a?.filename === "string" && a.filename.trim()
              ? a.filename.trim()
              : "Imagen";
          const createdAt =
            typeof a?.created_at === "string" ? a.created_at : undefined;
          return {
            id: path, // id estable
            name: filename,
            path,
            createdAt,
          };
        })
        .filter(Boolean) as any[];

      if (recovered.length) {
        imgs = recovered;
      }
    }

    if (imgs.length) {
      const nextImgs = await Promise.all(
        imgs.map(async (im) => {
          const path = typeof im?.path === "string" ? im.path.trim() : "";
          if (!path) return im;
          // Si ya viene con url, respetar.
          const hasUrl = typeof im?.url === "string" && im.url.trim();
          if (hasUrl) return im;
          const { data } = await supabase.storage
            .from("attachments")
            .createSignedUrl(path, 60 * 60 * 24); // 24h
          const signedUrl = data?.signedUrl ? String(data.signedUrl) : "";
          return signedUrl ? { ...im, url: signedUrl } : im;
        }),
      );
      const hydrated = { ...(payload ?? {}), images: nextImgs };
      return NextResponse.json(
        { payload: hydrated, updatedAt, updatedBy, historyCount },
        { status: 200, headers: { "cache-control": "no-store, max-age=0" } },
      );
    }
  } catch {
    // ignore and return raw payload
  }

  return NextResponse.json(
    { payload, updatedAt, updatedBy, historyCount },
    { status: 200, headers: { "cache-control": "no-store, max-age=0" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  const input = schema.safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Merge into values without clobbering other keys (_entries, _cover, etc.)
  const { data: note, error: readErr } = await supabase
    .from("notes")
    .select("id,values")
    .eq("id", id)
    .single();
  if (readErr || !note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prev = (note.values ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const updatedBy = { id: user.id, email: user.email ?? null };

  const prevReport = (prev as any)?._report ?? null;
  const prevHistory = Array.isArray(prevReport?.history) ? (prevReport.history as any[]) : [];
  const nextHistory = [...prevHistory, { at: now, by: updatedBy }].slice(-50);

  // Evitar "sorpresas": si por algún motivo llega un payload sin imágenes (o images=[]),
  // NO debemos borrar imágenes ya guardadas en el servidor (esto pasa con autosave/cola en mala conexión).
  let payloadToStore: any = input.data.payload as any;
  try {
    const incomingImgs = Array.isArray((payloadToStore as any)?.images) ? (payloadToStore as any).images : null;
    const prevImgs = Array.isArray((prevReport as any)?.payload?.images) ? (prevReport as any).payload.images : null;
    if (incomingImgs && incomingImgs.length === 0 && prevImgs && prevImgs.length > 0) {
      payloadToStore = { ...(payloadToStore ?? {}), images: prevImgs };
    }
  } catch {
    // ignore
  }

  // Derivar portada desde la primera imagen del reporte (si existe).
  // El payload guardado por el parent ya viene "sanitizado": images[] contiene { id,name,path }.
  let coverPath: string | null = null;
  let coverFilename: string | null = null;
  try {
    const imgs = Array.isArray((input.data.payload as any)?.images)
      ? ((input.data.payload as any).images as any[])
      : [];
    const first = imgs[0] ?? null;
    const p = typeof first?.path === "string" ? first.path.trim() : "";
    coverPath = p ? p : null;
    const n = typeof first?.name === "string" ? first.name.trim() : "";
    coverFilename = n ? n : null;
  } catch {
    coverPath = null;
    coverFilename = null;
  }

  const next = {
    ...prev,
    _report: {
      payload: payloadToStore,
      updatedAt: now,
      updatedBy,
      history: nextHistory,
    },
  };

  // Si tenemos portada basada en path, guardarla en values para que la tarjeta
  // la muestre al recargar y para evitar "portada vieja" por _coverInline.
  if (coverPath) {
    (next as any)._cover = {
      path: coverPath,
      filename: coverFilename ?? "Portada",
      updatedAt: now,
    };
    (next as any)._coverInline = null;
  }

  const { error: upErr } = await supabase.from("notes").update({ values: next }).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, updatedAt: now, updatedBy, historyCount: nextHistory.length });
}

