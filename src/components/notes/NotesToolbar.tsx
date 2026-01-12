"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  initial: {
    q: string;
    view: "grid" | "list";
    fav: boolean;
  };
};

export default function NotesToolbar({ initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(initial.q);

  const view = (sp.get("view") as "grid" | "list") ?? initial.view;
  const fav = (sp.get("fav") ?? (initial.fav ? "1" : "0")) === "1";

  useEffect(() => setQ(initial.q), [initial.q]);

  const hrefBase = useMemo(() => {
    const params = new URLSearchParams(sp);
    params.delete("q");
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  }, [pathname, sp]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(sp);
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value?: string) {
    const params = new URLSearchParams(sp);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notas…"
              className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
            />
          </label>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            {(fav || q.trim()) && (
              <Link
                href={hrefBase}
                className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Limpiar
              </Link>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setParam("fav", fav ? undefined : "1")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
                  fav
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
                )}
                title="Favoritos"
              >
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Favoritos</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setParam("view", view === "grid" ? "list" : "grid")
                }
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nueva</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

