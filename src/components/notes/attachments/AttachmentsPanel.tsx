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

export default function AttachmentsPanel({ noteId }: { noteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    mime: string;
    filename: string;
  } | null>(null);

  async function refresh() {
    setError(null);
    // leer cover actual (si existe)
    const { data: noteRow } = await supabase
      .from("notes")
      .select("values")
      .eq("id", noteId)
      .single();
    const cp =
      (noteRow as any)?.values?._cover?.path &&
      typeof (noteRow as any).values._cover.path === "string"
        ? String((noteRow as any).values._cover.path)
        : null;
    setCoverPath(cp);

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

    // Si no hay portada, usa automáticamente la primera imagen subida
    if (!cp) {
      const firstImg = imgRows[imgRows.length - 1]; // por order created_at desc, la última del array es la más vieja; usamos la más nueva:
      const newestImg = imgRows[0];
      const pick = newestImg ?? firstImg;
      if (pick) {
        await setAsCover(pick);
      }
    }
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

        // Si es imagen y no hay portada aún, marcar como portada automáticamente
        if (
          !coverPath &&
          inserted &&
          String(inserted.mime_type ?? "").startsWith("image/")
        ) {
          await fetch(`/api/notes/${noteId}/cover`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              attachmentId: inserted.id,
              path: inserted.path,
              mimeType: inserted.mime_type,
              filename: inserted.filename,
            }),
          });
          setCoverPath(String(inserted.path));
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
      // Preview inline para imágenes y PDFs; otros se abren en pestaña
      if (a.mime_type?.startsWith("image/") || a.mime_type?.includes("pdf")) {
        setPreview({ url: data.signedUrl, mime: a.mime_type, filename: a.filename });
      } else {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error abriendo archivo");
    } finally {
      setBusy(false);
    }
  }

  async function setAsCover(a: Attachment) {
    if (!a.mime_type?.startsWith("image/")) return;
    try {
      await fetch(`/api/notes/${noteId}/cover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attachmentId: a.id,
          path: a.path,
          mimeType: a.mime_type,
          filename: a.filename,
        }),
      });
      setCoverPath(a.path);
    } catch {
      // ignore
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold dark:text-zinc-50">Adjuntos / Escaneos</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Sube fotos, PDFs o documentos. En móvil puedes usar cámara.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            Subir archivos
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="mt-3">
        {attachments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            No hay adjuntos en esta nota.
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((a) => {
              const isImg = a.mime_type?.startsWith("image/");
              const isCover = !!coverPath && coverPath === a.path;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800",
                    busy && "opacity-70",
                  )}
                >
                  <div className="h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                    {isImg && thumbs[a.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={a.filename}
                        src={thumbs[a.id]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {a.mime_type?.includes("pdf") ? "PDF" : "DOC"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium dark:text-zinc-50">
                      {a.filename}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {prettySize(a.size)} ·{" "}
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                    {isCover ? (
                      <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        Portada
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Ver
                    </button>
                    {isImg ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAsCover(a)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        title="Usar como portada de la nota"
                      >
                        Portada
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => renameAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div className="truncate text-sm font-semibold dark:text-zinc-50">{preview.filename}</div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                onClick={() => setPreview(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800">
              {preview.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.filename}
                  className="max-h-[75dvh] w-full object-contain"
                />
              ) : (
                <iframe
                  title={preview.filename}
                  src={preview.url}
                  className="h-[75dvh] w-full"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              >
                Abrir en pestaña
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

