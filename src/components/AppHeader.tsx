"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, Plus, Search } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { DISABLE_RESUME_ONCE_KEY, LAST_ROUTE_KEY } from "@/components/ResumeGate";

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const isNotesHome = pathname === "/app";

  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => {
    setQ(sp.get("q") ?? "");
  }, [sp]);

  useEffect(() => {
    if (!isNotesHome) return;
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(sp);
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, isNotesHome]);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/app" className="text-sm font-semibold tracking-tight">
            Return Checks
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
              onClick={() => {
                try {
                  // Disable auto-resume for the next navigation only.
                  window.sessionStorage.setItem(DISABLE_RESUME_ONCE_KEY, "1");
                  // Reset last route to /app and reset the /app UI state.
                  window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ v: 1, ts: Date.now(), url: "/app" }));
                  window.localStorage.setItem(
                    "rc:lastAppLocation:v1",
                    JSON.stringify({ v: 1, ts: Date.now(), bucket: "pending", view: "list", scrollY: 0 }),
                  );
                } catch {}
                router.replace("/app");
                try {
                  window.scrollTo(0, 0);
                } catch {}
              }}
              title="Ir a inicio (reset)"
            >
              <Home className="h-4 w-4" />
              Inicio
            </button>
            <ThemeToggle />
            <form action="/auth/logout" method="post">
              <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Salir
              </button>
            </form>
          </div>
        </div>

        {isNotesHome ? (
          <div className="mt-3 flex items-center gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar notas..."
                className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
              />
            </label>

            <Link
              href="/app/new"
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              title="Nueva"
              aria-label="Nueva"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}

