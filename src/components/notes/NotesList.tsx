"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Copy,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  view: "grid" | "list";
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
  view,
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
    <div
      className={cn(
        view === "grid"
          ? "grid grid-cols-1 gap-4 md:grid-cols-2"
          : "flex flex-col gap-3",
      )}
    >
      {sorted.map((note) => {
        const excerpt = (note.body ?? "").trim().slice(0, 140);
        const isBusy = busyId === note.id;
        const templateName =
          typeof note.template_snapshot?.name === "string"
            ? note.template_snapshot.name
            : null;
        const meta = attachmentMetaByNoteId[String(note.id)];
        const firstDoc = firstDocUrlsByNoteId[String(note.id)] ?? null;
        const cover = coverUrls[note.id] ?? null;
        return (
          <div
            key={note.id}
            className={cn(
              "group rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700",
              isBusy && "opacity-60",
            )}
          >
            <div className="flex items-stretch gap-4">
              {/* Izquierda: info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/app/n/${note.id}`}
                    className="min-w-0 flex-1"
                    prefetch={false}
                  >
                    <div className="truncate text-base font-bold tracking-tight">
                      {note.title?.trim() ? note.title : "Sin título"}
                    </div>
                    {excerpt ? (
                      <div className="mt-1 line-clamp-3 text-sm text-zinc-700/80 dark:text-zinc-200/90">
                        {excerpt}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-zinc-500/70 dark:text-zinc-400/80">
                        (sin contenido)
                      </div>
                    )}
                  </Link>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleFavorite(note)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium",
                      note.favorite
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
                    )}
                    title={
                      note.favorite ? "Quitar de favoritos" : "Marcar favorito"
                    }
                  >
                    <Star className="h-3.5 w-3.5" />
                    Pin
                  </button>
                </div>

                {templateName ? (
                  <div className="mt-2 inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    Plantilla: {templateName}
                  </div>
                ) : null}

                {meta?.total ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                      <Paperclip className="h-3.5 w-3.5" />
                      {meta.total}
                    </span>
                    {meta.images ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {meta.images}
                      </span>
                    ) : null}
                    {meta.docs ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                        <FileText className="h-3.5 w-3.5" />
                        {meta.docs}
                      </span>
                    ) : null}
                    {firstDoc ? (
                      <a
                        href={firstDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[240px] items-center gap-1 truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        title={`Abrir: ${firstDoc.filename}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {firstDoc.filename}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDistanceToNow(new Date(note.updated_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </div>

                  <div className="flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => duplicate(note)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => remove(note)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>

              {/* Derecha: portada */}
              <Link
                href={`/app/n/${note.id}`}
                prefetch={false}
                className="shrink-0"
              >
                <div className="h-28 w-40 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 sm:h-32 sm:w-48">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Portada"
                      src={cover}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                      Sin portada
                    </div>
                  )}
                </div>
              </Link>
            </div>

          </div>
        );
      })}
    </div>
  );
}

