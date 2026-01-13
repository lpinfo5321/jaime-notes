"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Copy,
  FileText,
  Paperclip,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyName } from "@/lib/companyName";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  template_snapshot?: any;
  values?: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
};

type Props = {
  notes: NoteListItem[];
  coverUrls: Record<string, string>;
  attachmentMetaByNoteId: Record<
    string,
    { total: number; images: number; docs: number; firstDocName?: string }
  >;
  firstDocUrlsByNoteId: Record<
    string,
    { url: string; filename: string; mime: string }
  >;
};

export default function NotesList({
  notes,
  coverUrls,
  attachmentMetaByNoteId,
  firstDocUrlsByNoteId,
}: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { companyName } = useCompanyName();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftAgent, setDraftAgent] = useState<string>("");
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({});

  const empty = notes.length === 0;
  const sorted = useMemo(() => notes, [notes]);

  const openNote = useMemo(() => {
    if (!openId) return null;
    return sorted.find((n) => n.id === openId) ?? null;
  }, [openId, sorted]);

  function startEdit(n: NoteListItem) {
    const v = ((n.values ?? {}) as Record<string, unknown>) ?? {};
    const d =
      typeof (v as any)?._entry_date === "string"
        ? String((v as any)._entry_date)
        : new Date().toISOString().slice(0, 10);
    setDraftDate(d);
    setDraftAgent(n.title ?? "");
    setDraftNote(n.body ?? "");
    setDraftValues(v);
    setOpenId(n.id);
  }

  async function saveQuickEdit() {
    if (!openId) return;
    setBusyId(openId);
    try {
      const nextValues = {
        ...(draftValues ?? {}),
        _entry_date: draftDate,
      };
      const res = await fetch(`/api/notes/${openId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draftAgent,
          body: draftNote,
          values: nextValues,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      setOpenId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFavorite(note: NoteListItem) {
    setBusyId(note.id);
    try {
      await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: !note.favorite }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(note: NoteListItem) {
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/notes/${note.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { id: string };
      router.push(`/app/n/${json.id}`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(note: NoteListItem) {
    if (!confirm("¿Eliminar esta nota?")) return;
    setBusyId(note.id);
    try {
      await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No hay notas todavía. Crea la primera con <b>Nueva nota</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
      {sorted.map((note) => {
        const excerpt = (note.body ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 140);
        const isBusy = busyId === note.id;
        const meta = attachmentMetaByNoteId[String(note.id)];
        const firstDoc = firstDocUrlsByNoteId[String(note.id)] ?? null;
        const cover = coverUrls[note.id] ?? null;
        const v = ((note.values ?? {}) as any) ?? {};
        const dateRaw =
          typeof v?._entry_date === "string" ? String(v._entry_date) : null;
        const dateObj = dateRaw ? new Date(dateRaw + "T00:00:00") : new Date(note.updated_at);
        const noteDate = dateObj.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        });

        const isPdf = !!firstDoc && String(firstDoc.mime ?? "").includes("pdf");

        return (
          <div
            key={note.id}
            className={cn(
              "group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:shadow-lg dark:border-zinc-800/50 dark:bg-zinc-900 sm:p-5",
              isBusy && "pointer-events-none opacity-60",
            )}
          >
            {/* Arriba: nombre compañía */}
            <div
              className="mb-3 truncate px-10 text-center text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-white sm:mb-4 sm:px-12 sm:text-2xl md:text-3xl"
              title={companyName}
            >
              {companyName}
            </div>

            {/* Botón favorito */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => toggleFavorite(note)}
              className={cn(
                "absolute right-4 top-4 inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium backdrop-blur",
                note.favorite
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-zinc-200 bg-white/70 text-zinc-700 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900",
              )}
              title={note.favorite ? "Quitar de favoritos" : "Marcar favorito"}
            >
              <Star className={cn("h-3.5 w-3.5", note.favorite && "fill-current")} />
              Pin
            </button>

            {/* 2 columnas siempre */}
            <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 sm:grid-cols-[minmax(0,1fr)_44%] sm:gap-6">
              {/* Izquierda */}
              <div className="min-w-0">
                <div className="mb-2 text-xs font-bold text-zinc-500 dark:text-zinc-300 sm:text-sm">
                  Última Nota
                </div>

                <button
                  type="button"
                  onClick={() => startEdit(note)}
                  className="block w-full rounded-2xl bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 shadow-inner ring-zinc-300 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-900 sm:px-4 sm:py-3 sm:text-sm"
                  title="Toca para editar"
                >
                  <div className="font-semibold">{noteDate}</div>
                  <div className="mt-1 text-xs leading-snug text-zinc-700 dark:text-zinc-200 sm:text-sm">
                    {excerpt ? excerpt : "(sin contenido)"}
                  </div>
                </button>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {meta?.total ? (
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 sm:px-3 sm:py-1.5">
                      <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {meta.total}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">—</div>
                  )}

                  <div className="flex flex-wrap justify-end gap-1 sm:gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => remove(note)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Derecha: portada (contain) */}
              <div className="flex items-center justify-center">
                <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Portada"
                      src={cover}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : isPdf && firstDoc ? (
                    <iframe
                      title={firstDoc.filename}
                      src={firstDoc.url}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Sin portada seleccionada
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {openNote ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="text-sm font-semibold">Editar nota</div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Orden: Fecha → Agente → Nota
              </div>
            </div>

            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Fecha
                </span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-zinc-700"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Agente
                </span>
                <input
                  value={draftAgent}
                  onChange={(e) => setDraftAgent(e.target.value)}
                  placeholder="Nombre del agente…"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-zinc-700"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Nota
                </span>
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Escribe la nota…"
                  className="min-h-[140px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-zinc-700"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
                onClick={async () => {
                  if (!openNote) return;
                  if (!confirm("¿Eliminar esta nota?")) return;
                  setBusyId(openNote.id);
                  try {
                    await fetch(`/api/notes/${openNote.id}`, { method: "DELETE" });
                    setOpenId(null);
                    router.refresh();
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Eliminar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={saveQuickEdit}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

