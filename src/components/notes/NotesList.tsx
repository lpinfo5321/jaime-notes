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
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
        <p className="text-sm text-zinc-600">
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
        const tagKey = (
          note.tags?.[0] ?? note.template_snapshot?.name ?? ""
        ).toString();
        const bg = tagKey ? pastelFromKey(tagKey) : "white";
        const templateName =
          typeof note.template_snapshot?.name === "string"
            ? note.template_snapshot.name
            : null;
        const meta = attachmentMetaByNoteId[String(note.id)];
        const thumbs = thumbUrlsByNoteId[String(note.id)] ?? [];
        const firstDoc = firstDocUrlsByNoteId[String(note.id)] ?? null;
        return (
          <div
            key={note.id}
            className={cn(
              "group rounded-2xl border border-zinc-200 p-4 shadow-sm transition hover:border-zinc-300",
              view === "grid" && "mb-3 break-inside-avoid",
              isBusy && "opacity-60",
            )}
            style={view === "grid" ? { background: bg } : undefined}
          >
            {/* Miniaturas estilo Keep (1–3) */}
            {thumbs.length ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-zinc-200 bg-white/70">
                <div className="grid grid-cols-3 gap-[1px] bg-zinc-200">
                  {thumbs.slice(0, 3).map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={u}
                      alt="Miniatura"
                      src={u}
                      className="h-20 w-full object-cover"
                      loading="lazy"
                    />
                  ))}
                  {thumbs.length === 1 ? (
                    <div className="col-span-2 bg-white/70" />
                  ) : null}
                  {thumbs.length === 2 ? <div className="bg-white/70" /> : null}
                </div>
              </div>
            ) : coverUrls[note.id] ? (
              <Link
                href={`/app/n/${note.id}`}
                prefetch={false}
                className="mb-3 block overflow-hidden rounded-xl border border-zinc-200 bg-white/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Portada"
                  src={coverUrls[note.id]}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                />
              </Link>
            ) : null}

            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/app/n/${note.id}`}
                className="min-w-0 flex-1"
                prefetch={false}
              >
                <div className="truncate text-sm font-semibold">
                  {note.title?.trim() ? note.title : "Sin título"}
                </div>
                {excerpt ? (
                  <div className="mt-1 line-clamp-3 text-sm text-zinc-700/80">
                    {excerpt}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-zinc-500/70">
                    (sin contenido)
                  </div>
                )}
              </Link>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => toggleFavorite(note)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium backdrop-blur",
                  note.favorite
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-zinc-200 bg-white/70 text-zinc-700 hover:bg-white",
                )}
                title={note.favorite ? "Quitar de favoritos" : "Marcar favorito"}
              >
                <Star className="h-3.5 w-3.5" />
                {note.favorite ? "Pin" : "Pin"}
              </button>
            </div>

            {templateName ? (
              <div className="mt-2 inline-flex rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-xs font-medium text-zinc-700">
                Plantilla: {templateName}
              </div>
            ) : null}

            {meta?.total ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  {meta.total}
                </span>
                {meta.images ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {meta.images}
                  </span>
                ) : null}
                {meta.docs ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5">
                    <FileText className="h-3.5 w-3.5" />
                    {meta.docs}
                  </span>
                ) : null}
                {firstDoc ? (
                  <a
                    href={firstDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-zinc-700 hover:bg-white"
                    title={`Abrir: ${firstDoc.filename}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {firstDoc.filename}
                  </a>
                ) : meta.firstDocName ? (
                  <span className="truncate text-zinc-500">{meta.firstDocName}</span>
                ) : null}
              </div>
            ) : null}

            {note.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-xs text-zinc-700"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-zinc-500">
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
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-white/70"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => remove(note)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

