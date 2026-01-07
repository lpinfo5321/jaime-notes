"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  updated_at: string;
  created_at: string;
};

type Props = {
  notes: NoteListItem[];
  view: "grid" | "list";
};

export default function NotesList({ notes, view }: Props) {
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
          ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "flex flex-col gap-2",
      )}
    >
      {sorted.map((note) => {
        const excerpt = (note.body ?? "").trim().slice(0, 140);
        const isBusy = busyId === note.id;
        return (
          <div
            key={note.id}
            className={cn(
              "group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300",
              isBusy && "opacity-60",
            )}
          >
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
                  <div className="mt-1 line-clamp-3 text-sm text-zinc-600">
                    {excerpt}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-zinc-400">
                    (sin contenido)
                  </div>
                )}
              </Link>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => toggleFavorite(note)}
                className={cn(
                  "rounded-xl border px-2 py-1 text-xs font-medium",
                  note.favorite
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
                title={note.favorite ? "Quitar de favoritos" : "Marcar favorito"}
              >
                {note.favorite ? "★" : "☆"}
              </button>
            </div>

            {note.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-zinc-500">
                Actualizada{" "}
                {new Date(note.updated_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                })}
              </div>

              <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => duplicate(note)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => remove(note)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
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

