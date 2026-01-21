"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, MoreHorizontal, Plus, Search } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { DISABLE_RESUME_ONCE_KEY, LAST_ROUTE_KEY } from "@/components/ResumeGate";
import { flushQueuedReportsOnce, getQueuedReportsCount } from "@/lib/reportQueue";
import { getSyncSnapshot, setSyncSnapshot, subscribeSyncSnapshot, type SyncSnapshot } from "@/lib/syncStatus";

const SELECT_MODE_KEY = "rc:selectMode:v1";

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const isNotesHome = pathname === "/app";

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [selectMode, setSelectMode] = useState(false);
  const [qBy, setQBy] = useState(sp.get("qBy") ?? "company"); // company | pay | status
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [sync, setSync] = useState<SyncSnapshot>(() => getSyncSnapshot());

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setQBy(sp.get("qBy") ?? "company");
    setStatus(sp.get("status") ?? "");
    setMobileActionsOpen(false);
  }, [sp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSelectMode(window.localStorage.getItem(SELECT_MODE_KEY) === "1");
    } catch {}
    const onChanged = (ev: any) => {
      try {
        const next = !!ev?.detail?.selectMode;
        setSelectMode(next);
      } catch {}
    };
    window.addEventListener("rc:selectModeChanged" as any, onChanged as any);
    return () => window.removeEventListener("rc:selectModeChanged" as any, onChanged as any);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Inicializar estado global
    try {
      setSyncSnapshot({ online: !!navigator.onLine, queuedReports: getQueuedReportsCount() });
    } catch {
      setSyncSnapshot({ queuedReports: getQueuedReportsCount() });
    }
    const unsub = subscribeSyncSnapshot(setSync);

    const onOnline = () => {
      setSyncSnapshot({ online: true });
      void flushQueuedReportsOnce();
    };
    const onOffline = () => setSyncSnapshot({ online: false });

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Intento rápido al montar
    try {
      if (navigator.onLine) void flushQueuedReportsOnce();
    } catch {}

    return () => {
      unsub?.();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isNotesHome) return;
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(sp);
      // Only use q for company/pay modes (status uses dropdown)
      if (qBy !== "status") {
        if (q.trim()) params.set("q", q.trim());
        else params.delete("q");
      } else {
        params.delete("q");
      }
      // always persist mode
      if (qBy && qBy !== "company") params.set("qBy", qBy);
      else params.delete("qBy");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, qBy, isNotesHome]);

  function setParam(key: string, value?: string) {
    const params = new URLSearchParams(sp);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }
  function setMode(next: "company" | "pay" | "status") {
    setQBy(next);
    const params = new URLSearchParams(sp);
    if (next === "company") params.delete("qBy");
    else params.set("qBy", next);
    if (next === "status") {
      params.delete("q");
      // keep status as-is (or blank)
    } else {
      params.delete("status");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/35">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/app" className="text-sm font-semibold tracking-tight">
            Return Checks
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              {!sync.online ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                  Sin conexión
                </div>
              ) : null}
              {sync.saving || sync.state === "saving" ? (
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  Guardando…
                </div>
              ) : sync.state === "queued" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                  En cola
                </div>
              ) : sync.state === "error" ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                  Error
                </div>
              ) : sync.state === "saved" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  Guardado
                </div>
              ) : null}
              {sync.queuedReports > 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  Cola: {sync.queuedReports}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
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
              <button className="rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60">
                Salir
              </button>
            </form>
          </div>
        </div>

        {isNotesHome ? (
          <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
            <div className="relative flex h-11 w-full max-w-none items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 px-2 shadow-sm backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:max-w-3xl">
              {/* Mobile: dropdown para elegir el filtro (más limpio) */}
              <select
                value={(qBy as any) || "company"}
                onChange={(e) => setMode(e.target.value as any)}
                className="h-9 w-[120px] rounded-xl border border-zinc-200/70 bg-white/70 px-2 text-xs font-black text-zinc-800 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800/60 dark:bg-zinc-950/35 dark:text-zinc-100 dark:ring-zinc-700 md:hidden"
                title="Filtro"
              >
                <option value="company">Compañía</option>
                <option value="pay">PAY</option>
                <option value="status">Status</option>
              </select>

              {/* Desktop: chips */}
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  onClick={() => setMode("company")}
                  className={`rounded-xl px-2 py-1 text-[11px] font-black ${
                    (qBy || "company") === "company"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  title="Buscar por compañía"
                >
                  Compañía
                </button>
                <button
                  type="button"
                  onClick={() => setMode("pay")}
                  className={`rounded-xl px-2 py-1 text-[11px] font-black ${
                    qBy === "pay"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  title="Buscar por PAY (Maker/Payor o Payee)"
                >
                  PAY
                </button>
                <button
                  type="button"
                  onClick={() => setMode("status")}
                  className={`rounded-xl px-2 py-1 text-[11px] font-black ${
                    qBy === "status"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  title="Filtrar por status"
                >
                  Status
                </button>
              </div>

              <div className="h-5 w-px bg-zinc-200/80 dark:bg-zinc-800/70" />

              {qBy === "status" ? (
                <select
                  value={status}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStatus(v);
                    setParam("status", v);
                  }}
                  className="h-10 w-full rounded-xl border border-zinc-200/70 bg-white/70 px-3 text-sm font-semibold text-zinc-800 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800/60 dark:bg-zinc-950/35 dark:text-zinc-100 dark:ring-zinc-700"
                  title="Status (Check)"
                >
                  <option value="">Todos</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid Cash">Paid Cash</option>
                  <option value="Paid Check">Paid Check</option>
                  <option value="Redeposited">Redeposited</option>
                </select>
              ) : (
                <>
                  <Search className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={
                      qBy === "pay"
                        ? "Buscar PAY…"
                        : "Buscar compañía…"
                    }
                    className="h-10 w-full bg-transparent pr-2 text-base outline-none sm:text-sm"
                  />
                </>
              )}

              {/* Mobile: esconder botones y ponerlos en menú */}
              <button
                type="button"
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 text-zinc-700 shadow-sm hover:bg-white/90 dark:border-zinc-800/60 dark:bg-zinc-950/35 dark:text-zinc-200 dark:hover:bg-zinc-950/45 md:hidden"
                onClick={() => setMobileActionsOpen((v) => !v)}
                title="Acciones"
                aria-label="Acciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {mobileActionsOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-xl backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-950/80 md:hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => {
                      setMobileActionsOpen(false);
                      try {
                        window.dispatchEvent(new CustomEvent("rc:toggleSelectMode"));
                      } catch {}
                    }}
                  >
                    <span>{selectMode ? "Cancelar selección" : "Seleccionar"}</span>
                  </button>
                  <Link
                    href="/app/new"
                    className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setMobileActionsOpen(false)}
                  >
                    <span>Nueva</span>
                    <Plus className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="hidden items-center justify-end gap-2 md:flex">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 px-3 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-white/90 dark:border-zinc-800/60 dark:bg-zinc-950/35 dark:text-zinc-200 dark:hover:bg-zinc-950/45"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent("rc:toggleSelectMode"));
                  } catch {}
                }}
                title="Seleccionar varias"
              >
                {selectMode ? "Cancelar" : "Seleccionar"}
              </button>

              <Link
                href="/app/new"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                title="Nueva"
                aria-label="Nueva"
              >
                <Plus className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

