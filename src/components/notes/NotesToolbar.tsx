"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Star } from "lucide-react";
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
    <div className="sticky top-[60px] z-10 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight">
            Notas
          </h1>
          <label className="relative block flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notas…"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
            />
          </label>
          {q.trim() && (
            <Link
              href={hrefBase}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Limpiar
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setParam("fav", fav ? undefined : "1")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
              fav
                ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
            )}
            title="Favoritos"
          >
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Favoritos</span>
          </button>

          <Link
            href="/app/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
