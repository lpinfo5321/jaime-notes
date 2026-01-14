"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Attachment = {
  id: string;
  note_id: string;
  path: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

// (note.values) shape we use: { _imageOrder?: string[] }
type ReportImage = { id: string; name: string; dataUrl: string; createdAt?: string };

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
  const [imageOrderIds, setImageOrderIds] = useState<string[]>([]);
  const [reportImages, setReportImages] = useState<ReportImage[]>([]);
  const [reportCoverId, setReportCoverId] = useState<string | null>(null);
  const [reportPayload, setReportPayload] = useState<any>(null);
  const [preview, setPreview] = useState<{
    url: string;
    mime: string;
    filename: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const imgAttachments = useMemo(
    () => attachments.filter((a) => a.mime_type?.startsWith("image/")),
    [attachments],
  );

  const orderedAttachments = useMemo(() => {
    if (!attachments.length) return attachments;
    const byId = new Map(attachments.map((a) => [a.id, a]));
    const imgIds = imgAttachments.map((a) => a.id);
    const order = (imageOrderIds ?? []).filter((id) => imgIds.includes(id));
    const remaining = imgIds.filter((id) => !order.includes(id));
    const orderedImgs = [...order, ...remaining]
      .map((id) => byId.get(id))
      .filter(Boolean) as Attachment[];

    const nonImgs = attachments.filter((a) => !a.mime_type?.startsWith("image/"));
    return [...orderedImgs, ...nonImgs];
  }, [attachments, imgAttachments, imageOrderIds]);

  async function saveImageOrder(nextIds: string[]) {
    try {
      const { data: noteRow } = await supabase
        .from("notes")
        .select("values")
        .eq("id", noteId)
        .single();
      const prev = ((noteRow as any)?.values ?? {}) as Record<string, unknown>;
      const next = {
        ...prev,
        _imageOrder: nextIds,
        _imageOrderUpdatedAt: new Date().toISOString(),
      };
      await supabase.from("notes").update({ values: next }).eq("id", noteId);
    } catch {
      // ignore
    }
  }

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

    // imágenes dentro del reporte (guardadas en values._report.payload.images)
    const payload = (noteRow as any)?.values?._report?.payload;
    setReportPayload(payload ?? null);
    const imgsRaw = Array.isArray(payload?.images) ? payload.images : [];
    const imgs: ReportImage[] = imgsRaw
      .map((im: any) => ({
        id: typeof im?.id === "string" ? im.id : "",
        name: typeof im?.name === "string" ? im.name : "Image",
        dataUrl: typeof im?.dataUrl === "string" ? im.dataUrl : "",
        createdAt: typeof im?.createdAt === "string" ? im.createdAt : undefined,
      }))
      .filter((im: ReportImage) => !!im.id && im.dataUrl.startsWith("data:image/"));
    setReportImages(imgs);

    const rcid =
      typeof (noteRow as any)?.values?._reportCoverImageId === "string"
        ? String((noteRow as any).values._reportCoverImageId)
        : null;
    setReportCoverId(rcid);

    const savedOrder = Array.isArray((noteRow as any)?.values?._imageOrder)
      ? ((noteRow as any).values._imageOrder as string[])
      : null;
    if (savedOrder) setImageOrderIds(savedOrder);

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
    if (!savedOrder) {
      // default order = newest first (same as query order)
      setImageOrderIds(imgRows.map((a) => a.id));
    }
    const nextThumbs: Record<string, string> = {};
    await Promise.all(
      imgRows.slice(0, 80).map(async (a) => {
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

  // Realtime refresh when note values change (report images, cover, order)
  useEffect(() => {
    const channel = supabase
      .channel(`note-values-${noteId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `id=eq.${noteId}` },
        () => {
          if (busy) return;
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
      // If user chooses an attachment as cover, clear report-cover selection.
      try {
        const { data: noteRow } = await supabase
          .from("notes")
          .select("values")
          .eq("id", noteId)
          .single();
        const prev = ((noteRow as any)?.values ?? {}) as Record<string, unknown>;
        const next = { ...prev, _reportCoverImageId: null };
        await supabase.from("notes").update({ values: next }).eq("id", noteId);
        setReportCoverId(null);
      } catch {}
    } catch {
      // ignore
    }
  }

  async function setReportCover(imgId: string) {
    try {
      const { data: noteRow } = await supabase
        .from("notes")
        .select("values")
        .eq("id", noteId)
        .single();
      const prev = ((noteRow as any)?.values ?? {}) as Record<string, unknown>;
      const next = { ...prev, _reportCoverImageId: imgId, _reportCoverUpdatedAt: new Date().toISOString() };
      await supabase.from("notes").update({ values: next }).eq("id", noteId);
      setReportCoverId(imgId);
    } catch {
      // ignore
    }
  }

  function SortableReportThumb({ im }: { im: ReportImage }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: `r:${im.id}`,
    });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    } as Record<string, string | undefined>;
    const isCover = !!reportCoverId && reportCoverId === im.id;
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
          isDragging && "opacity-70",
        )}
      >
        <button
          type="button"
          className="block h-full w-full"
          title="Arrastra para ordenar. Click: Portada (reporte). Doble click: ver."
          onClick={() => setReportCover(im.id)}
          onDoubleClick={() => setPreview({ url: im.dataUrl, mime: "image/jpeg", filename: im.name })}
          {...attributes}
          {...listeners}
        >
          <div className="aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.dataUrl} alt={im.name} className="h-full w-full object-cover" />
          </div>
        </button>
        {isCover ? (
          <div className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
            Portada
          </div>
        ) : null}
      </div>
    );
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
      // keep order consistent if it was an image
      if (a.mime_type?.startsWith("image/")) {
        setImageOrderIds((prev) => {
          const next = prev.filter((id) => id !== a.id);
          void saveImageOrder(next);
          return next;
        });
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    } finally {
      setBusy(false);
    }
  }

  function SortableThumb({ a }: { a: Attachment }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: a.id,
    });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    } as Record<string, string | undefined>;
    const isCover = !!coverPath && coverPath === a.path;
    const url = thumbs[a.id] ?? null;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
          isDragging && "opacity-70",
        )}
      >
        <button
          type="button"
          className="block h-full w-full"
          title="Arrastra para ordenar. Click: Portada. Doble click: ver."
          onClick={() => setAsCover(a)}
          onDoubleClick={() => openAttachment(a)}
          {...attributes}
          {...listeners}
        >
          <div className="aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={a.filename} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500 dark:text-zinc-300">
                IMG
              </div>
            )}
          </div>
        </button>

        {isCover ? (
          <div className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-bold text-white">
            Portada
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Adjuntos / Escaneos</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Sube fotos, PDFs o documentos. En móvil puedes usar cámara.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            Subir archivos
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Imágenes del reporte */}
      {reportImages.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold">Imágenes del reporte</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Arrastra para ordenar · Click = Portada (tarjeta) · Doble click = Ver
            </div>
          </div>

          <div className="mt-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const aId = String(active.id).replace(/^r:/, "");
                const oId = String(over.id).replace(/^r:/, "");
                setReportImages((prev) => {
                  const oldIndex = prev.findIndex((x) => x.id === aId);
                  const newIndex = prev.findIndex((x) => x.id === oId);
                  if (oldIndex < 0 || newIndex < 0) return prev;
                  const next = arrayMove(prev, oldIndex, newIndex);
                  // Persist by updating report payload order (affects printing too)
                  const nextPayload = { ...(reportPayload ?? {}), images: next };
                  setReportPayload(nextPayload);
                  void fetch(`/api/notes/${noteId}/report`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ payload: nextPayload }),
                  }).catch(() => undefined);
                  return next;
                });
              }}
            >
              <SortableContext
                items={reportImages.map((im) => `r:${im.id}`)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {reportImages.map((im) => (
                    <SortableReportThumb key={im.id} im={im} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      ) : null}

      {/* Galería de imágenes (ordenable) */}
      {imgAttachments.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold">Imágenes</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Arrastra para ordenar · Click = Portada · Doble click = Ver
            </div>
          </div>

          <div className="mt-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                setImageOrderIds((prev) => {
                  const oldIndex = prev.indexOf(String(active.id));
                  const newIndex = prev.indexOf(String(over.id));
                  if (oldIndex < 0 || newIndex < 0) return prev;
                  const next = arrayMove(prev, oldIndex, newIndex);
                  void saveImageOrder(next);
                  return next;
                });
              }}
            >
              <SortableContext items={imageOrderIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {imageOrderIds
                    .map((id) => imgAttachments.find((x) => x.id === id))
                    .filter(Boolean)
                    .map((a) => (
                      <SortableThumb key={(a as Attachment).id} a={a as Attachment} />
                    ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        {attachments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            No hay adjuntos en esta nota.
          </div>
        ) : (
          <div className="space-y-2">
            {orderedAttachments.map((a) => {
              const isImg = a.mime_type?.startsWith("image/");
              const isCover = !!coverPath && coverPath === a.path;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950",
                    busy && "opacity-70",
                  )}
                >
                  <div className="h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    {isImg && thumbs[a.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={a.filename}
                        src={thumbs[a.id]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500 dark:text-zinc-300">
                        {a.mime_type?.includes("pdf") ? "PDF" : "DOC"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.filename}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {prettySize(a.size)} ·{" "}
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                    {isCover ? (
                      <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Portada
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Ver
                    </button>
                    {isImg ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAsCover(a)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        title="Usar como portada de la nota"
                      >
                        Portada
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => renameAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteAttachment(a)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
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
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="truncate text-sm font-semibold">{preview.filename}</div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => setPreview(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-950">
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
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
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

