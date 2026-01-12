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
  thumbUrlsByNoteId: Record<string, string[]>;
  firstDocUrlsByNoteId: Record<
    string,
    { url: string; filename: string; mime: string }
  >;
};

function pastelFromKey(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 96%)`;
}

export default function NotesList({
  notes,
  view,
  coverUrls,
  attachmentMetaByNoteId,
  thumbUrlsByNoteId,
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
          ? "columns-1 gap-3 sm:columns-2 lg:columns-3 [column-fill:_balance]"
          : "flex flex-col gap-2",
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
        const thumbs = thumbUrlsByNoteId[String(note.id)] ?? [];
        const firstDoc = firstDocUrlsByNoteId[String(note.id)] ?? null;
        const cover = coverUrls[note.id] ?? null;
        return (
          <div
            key={note.id}
            className={cn(
              "group flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900",
              isBusy && "opacity-60",
            )}
          >
            {/* Izquierda: info */}
            <div className="min-w-0 flex-1">
              <Link
                href={`/app/n/${note.id}`}
                className="block"
                prefetch={false}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {note.title?.trim() ? note.title : "Sin título"}
                  </h3>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavorite(note);
                    }}
                    className={cn(
                      "shrink-0 rounded-lg p-1.5 transition",
                      note.favorite
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400",
                    )}
                    title={note.favorite ? "Quitar de favoritos" : "Marcar favorito"}
                  >
                    <Star
                      className={cn(
                        "h-5 w-5",
                        note.favorite && "fill-current",
                      )}
                    />
                  </button>
                </div>

                {excerpt ? (
                  <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {excerpt}
                  </p>
                ) : (
                  <p className="text-sm italic text-zinc-400 dark:text-zinc-600">
                    Sin contenido
                  </p>
                )}
              </Link>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                {templateName ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-medium dark:border-zinc-800 dark:bg-zinc-800/50">
                    Plantilla: {templateName}
                  </span>
                ) : null}
                {meta?.total ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="h-3.5 w-3.5" />
                      {meta.total}
                    </span>
                    {meta.images ? (
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {meta.images}
                      </span>
                    ) : null}
                    {meta.docs ? (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {meta.docs}
                      </span>
                    ) : null}
                  </>
                ) : null}
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(note.updated_at), {
                    addSuffix: true,
                    locale: es,
                  })}
                </span>
              </div>

              {note.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {note.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => duplicate(note)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => remove(note)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>

            {/* Derecha: portada */}
            <Link
              href={`/app/n/${note.id}`}
              prefetch={false}
              className="shrink-0"
            >
              <div className="h-32 w-32 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:h-40 sm:w-40">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Portada"
                    src={cover}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-400 dark:text-zinc-600">
                    Sin portada
                  </div>
                )}
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

