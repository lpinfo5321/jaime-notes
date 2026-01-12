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
        const noteDate = new Date(note.updated_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        });
        return (
          <Link
            key={note.id}
            href={`/app/n/${note.id}`}
            prefetch={false}
            className={cn(
              "group relative flex gap-6 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-sm transition hover:shadow-lg dark:border-zinc-800/50 dark:bg-zinc-900",
              isBusy && "pointer-events-none opacity-60",
            )}
          >
            {/* Izquierda: info */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Título grande */}
              <h2 className="mb-3 text-2xl font-black uppercase tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {note.title?.trim() ? note.title : "Sin título"}
              </h2>

              {/* Última Nota */}
              <div className="mb-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                Última Nota
              </div>

              {/* Fecha + Contenido */}
              <div className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <span className="font-bold">{noteDate}</span>
                {excerpt && (
                  <span className="ml-1">
                    {excerpt}
                  </span>
                )}
              </div>

              {/* Indicador de adjuntos */}
              {meta?.total ? (
                <div className="mt-auto flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    <Paperclip className="h-4 w-4" />
                    {meta.total}
                  </div>
                </div>
              ) : null}

              {/* Botón favorito (esquina superior izquierda) */}
              <button
                type="button"
                disabled={isBusy}
                onClick={(e) => {
                  e.preventDefault();
                  toggleFavorite(note);
                }}
                className={cn(
                  "absolute left-4 top-4 rounded-full p-2 transition",
                  note.favorite
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-700",
                )}
                title={note.favorite ? "Quitar de favoritos" : "Marcar favorito"}
              >
                <Star
                  className={cn("h-5 w-5", note.favorite && "fill-current")}
                />
              </button>
            </div>

            {/* Derecha: portada grande */}
            <div className="relative shrink-0">
              <div className="h-48 w-48 overflow-hidden rounded-2xl border-2 border-zinc-200/50 bg-zinc-50 shadow-md dark:border-zinc-800/50 dark:bg-zinc-950 sm:h-56 sm:w-56">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Portada"
                    src={cover}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-400 dark:text-zinc-600">
                    Sin imagen
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

