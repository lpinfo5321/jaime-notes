"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

type Props = {
  initial: {
    q: string;
  };
};

export default function NotesToolbar({ initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(initial.q);

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
    <div className="sticky top-[56px] z-10 -mx-4 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Notas
            </h1>
            {q.trim() && (
              <Link
                href={hrefBase}
                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Limpiar
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/app/new"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva</span>
            </Link>
          </div>
        </div>

        <div>
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notas…"
              className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

