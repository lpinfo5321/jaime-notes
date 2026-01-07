"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = {
  initial: {
    q: string;
    view: "grid" | "list";
    fav: boolean;
    tag: string;
  };
};

export default function NotesToolbar({ initial }: Props) {
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">Notas</h1>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">
            MVP
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/app/new"
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            Nueva nota
          </Link>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setParam("fav", fav ? undefined : "1")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium",
                fav
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              )}
              title="Filtrar favoritos"
            >
              Favoritos
            </button>
            <button
              type="button"
              onClick={() => setParam("view", view === "grid" ? "list" : "grid")}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              title="Cambiar vista"
            >
              {view === "grid" ? "Vista lista" : "Vista grid"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="sr-only">Buscar</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título o texto…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="sr-only">Filtrar por tag</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Filtrar por tag (ej. cliente, incidente)…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2"
          />
        </label>
      </div>

      <div className="mt-2 text-xs text-zinc-500">
        Tip: escribe tags dentro de una nota (Enter) y luego filtra por tag aquí.
        {" "}
        <Link href={hrefBase} className="underline">
          Limpiar filtros
        </Link>
      </div>
    </div>
  );
}

