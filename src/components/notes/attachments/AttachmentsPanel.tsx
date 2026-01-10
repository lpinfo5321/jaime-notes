"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Attachment = {
  id: string;
  note_id: string;
  path: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

function sanitizeName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

function prettySize(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AttachmentsPanel({
  noteId,
  cover,
  onSetCover,
}: {
  noteId: string;
  cover: null | { id: string; path: string; filename: string; mime_type: string };
  onSetCover: (a: null | {
    id: string;
    path: string;
    filename: string;
    mime_type: string;
  }) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<
    | null
    | { kind: "image" | "pdf" | "other"; url: string; filename: string }
  >(null);

  async function refresh() {
    setError(null);
    const { data, error: err } = await supabase
      .from("attachments")
      .select("id,note_id,path,filename,mime_type,size,created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setAttachments([]);
      return;
    }

    const rows = (data ?? []) as Attachment[];
    setAttachments(rows);

    // miniaturas: solo imágenes
    const imgRows = rows.filter((a) => a.mime_type?.startsWith("image/"));
    const nextThumbs: Record<string, string> = {};
    await Promise.all(
      imgRows.slice(0, 24).map(async (a) => {
        const { data: signed } = await supabase.storage
          .from("attachments")
          .createSignedUrl(a.path, 60 * 15);
        if (signed?.signedUrl) nextThumbs[a.id] = signed.signedUrl;
      }),
    );
    setThumbs(nextThumbs);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error("No autenticado");

      for (const file of Array.from(files)) {
        const safeName = sanitizeName(file.name) || "archivo";
        const uid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const path = `${user.id}/${noteId}/${uid}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw upErr;

        const { data: inserted, error: dbErr } = await supabase
          .from("attachments")
          .insert({
          user_id: user.id,
          note_id: noteId,
          path,
          filename: safeName,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
        })
          .select("id,path,filename,mime_type")
          .single();
        if (dbErr) throw dbErr;

        // Si es imagen y no hay portada, auto-asignar portada
        if (!cover && (file.type || "").startsWith("image/") && inserted) {
          onSetCover({
            id: inserted.id,
            path: inserted.path,
            filename: inserted.filename,
            mime_type: inserted.mime_type,
          });
        }
      }

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo archivos");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function openAttachment(a: Attachment) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.storage
        .from("attachments")
        .createSignedUrl(a.path, 60 * 20);
      if (err) throw err;
      if (!data?.signedUrl) throw new Error("No se pudo crear link");
      const kind = a.mime_type?.startsWith("image/")
        ? "image"
        : a.mime_type?.includes("pdf")
          ? "pdf"
          : "other";
      // Preview in-app for images/PDF; fallback to new tab for others.
      if (kind === "other") {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        setPreview({ kind, url: data.signedUrl, filename: a.filename });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error abriendo archivo");
    } finally {
      setBusy(false);
    }
  }

  async function renameAttachment(a: Attachment) {
    const next = prompt("Nuevo nombre del archivo:", a.filename);
    if (!next) return;
    const filename = sanitizeName(next) || a.filename;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("attachments")
        .update({ filename })
        .eq("id", a.id);
      if (err) throw err;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error renombrando");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAttachment(a: Attachment) {
    if (!confirm(`¿Eliminar "${a.filename}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const { error: sErr } = await supabase.storage
        .from("attachments")
        .remove([a.path]);
      if (sErr) throw sErr;
      const { error: dbErr } = await supabase
        .from("attachments")
        .delete()
        .eq("id", a.id);
      if (dbErr) throw dbErr;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Adjuntos / Escaneos</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Sube fotos, PDFs o documentos. En móvil puedes usar cámara.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Subir archivos
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Escanear (cámara)
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => uploadFiles(e.target.files)}
      />

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3">
        {attachments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
            No hay adjuntos en esta nota.
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((a) => {
              const isImg = a.mime_type?.startsWith("image/");
              const isCover = cover?.id === a.id;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3",
                    busy && "opacity-70",
                  )}
                >
                  <div className="h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {isImg && thumbs[a.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={a.filename}
                        src={thumbs[a.id]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500">
                        {a.mime_type?.includes("pdf") ? "PDF" : "DOC"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.filename}
                      {isCover ? (
                        <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Portada
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {prettySize(a.size)} ·{" "}
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Previsualizar
                    </button>
                    {isImg ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onSetCover(
                            isCover
                              ? null
                              : {
                                  id: a.id,
                                  path: a.path,
                                  filename: a.filename,
                                  mime_type: a.mime_type,
                                },
                          )
                        }
                        className={cn(
                          "rounded-lg px-2 py-1 text-xs font-medium",
                          isCover
                            ? "text-emerald-800 hover:bg-emerald-50"
                            : "text-zinc-700 hover:bg-zinc-100",
                        )}
                        title="Usar esta imagen como portada en la tarjeta"
                      >
                        {isCover ? "Quitar portada" : "Marcar portada"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => renameAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="truncate text-sm font-semibold">
                {preview.filename}
              </div>
              <div className="flex gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Abrir en pestaña
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-zinc-50 p-4">
              {preview.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={preview.filename}
                  src={preview.url}
                  className="mx-auto max-h-[72vh] w-auto rounded-xl border border-zinc-200 bg-white object-contain"
                />
              ) : preview.kind === "pdf" ? (
                <iframe
                  title={preview.filename}
                  src={preview.url}
                  className="h-[72vh] w-full rounded-xl border border-zinc-200 bg-white"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

