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
import { COMPANY_NAME } from "@/lib/config";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  template_snapshot?: any;
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

  const empty = notes.length === 0;
  const sorted = useMemo(() => notes, [notes]);

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
        const noteDate = new Date(note.updated_at).toLocaleDateString("es-ES", {
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
              title={COMPANY_NAME}
            >
              {COMPANY_NAME}
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

                <div className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs text-zinc-800 shadow-inner dark:bg-zinc-950 dark:text-zinc-100 sm:px-4 sm:py-3 sm:text-sm">
                  <div className="font-semibold">{noteDate}</div>
                  <div className="mt-1 text-xs leading-snug text-zinc-700 dark:text-zinc-200 sm:text-sm">
                    {excerpt ? excerpt : "(sin contenido)"}
                  </div>
                </div>

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
                      onClick={() => duplicate(note)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Duplicar</span>
                    </button>
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

                <div className="mt-3">
                  <Link
                    href={`/app/n/${note.id}`}
                    prefetch={false}
                    className="text-xs font-semibold text-zinc-900 underline-offset-4 hover:underline dark:text-white sm:text-sm"
                  >
                    Abrir nota →
                  </Link>
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
    </div>
  );
}

