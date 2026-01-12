"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus, Search, Star, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  initial: {
    q: string;
    view: "grid" | "list";
    fav: boolean;
    tag: string;
  };
  topTags: string[];
};

export default function NotesToolbar({ initial, topTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(initial.q);
  const [tag, setTag] = useState(initial.tag);

  const view = (sp.get("view") as "grid" | "list") ?? initial.view;
  const fav = (sp.get("fav") ?? (initial.fav ? "1" : "0")) === "1";

  useEffect(() => setQ(initial.q), [initial.q]);
  useEffect(() => setTag(initial.tag), [initial.tag]);

  const hrefBase = useMemo(() => {
    const params = new URLSearchParams(sp);
    params.delete("q");
    params.delete("tag");
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  }, [pathname, sp]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(sp);
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      if (tag.trim()) params.set("tag", tag.trim());
      else params.delete("tag");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag]);

  function setParam(key: string, value?: string) {
    const params = new URLSearchParams(sp);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="md:sticky md:top-[60px] md:z-10 -mx-4 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight dark:text-zinc-50">
              Notas
            </h1>
            {(fav || q.trim() || tag.trim()) && (
              <Link
                href={hrefBase}
                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Limpiar
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setParam("fav", fav ? undefined : "1")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
                fav
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
              )}
              title="Favoritos"
            >
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Favoritos</span>
            </button>

            <button
              type="button"
              onClick={() => setParam("view", view === "grid" ? "list" : "grid")}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Cambiar vista"
            >
              {view === "grid" ? (
                <List className="h-4 w-4" />
              ) : (
                <LayoutGrid className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {view === "grid" ? "Lista" : "Tarjetas"}
              </span>
            </button>

            <Link
              href="/app/new"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_280px]">
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notas…"
              className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Filtrar por tag</span>
            <Tag className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Filtrar por tag…"
              className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
            />
          </label>
        </div>

        {topTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {topTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setParam("tag", t)}
                className={cn(
                  "rounded-full border px-2 py-1 text-xs font-medium",
                  tag === t
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-600 dark:bg-zinc-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                )}
                title={`Filtrar por #${t}`}
              >
                #{t}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

