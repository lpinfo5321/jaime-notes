"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Home, LogOut, MoreHorizontal, Plus, Search, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { DISABLE_RESUME_ONCE_KEY, LAST_ROUTE_KEY } from "@/components/ResumeGate";

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
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const logoutFormRef = useRef<HTMLFormElement>(null);

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

  // Intercept browser install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      // Show banner only if not already installed
      if (!window.matchMedia("(display-mode: standalone)").matches) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  }

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
    <>
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/35">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/app" className="flex items-center gap-2 shrink-0">
            <Image
              src="/logo.png"
              alt="Return Checks"
              width={36}
              height={36}
              className="rounded-lg object-contain"
              priority
            />
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">Return Checks</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
              title="Contactos"
              onClick={() => {
                try { window.dispatchEvent(new CustomEvent("rc:showContacts")); } catch {}
                router.replace("/app");
              }}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Contactos</span>
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
              onClick={() => {
                try {
                  window.sessionStorage.setItem(DISABLE_RESUME_ONCE_KEY, "1");
                  window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ v: 1, ts: Date.now(), url: "/app" }));
                  window.localStorage.setItem(
                    "rc:lastAppLocation:v1",
                    JSON.stringify({ v: 1, ts: Date.now(), bucket: "pending", view: "list", scrollY: 0 }),
                  );
                } catch {}
                // Emit event so NotesList resets to dashboard without full remount
                try {
                  window.dispatchEvent(new CustomEvent("rc:goToDashboard"));
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
            <button
              type="button"
              onClick={() => setShowLogoutModal(true)}
              title="Cerrar sesión"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-red-50 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
            {/* Hidden form — only submitted after confirmation */}
            <form ref={logoutFormRef} action="/auth/logout" method="post" className="hidden" />
          </div>
        </div>

        {isNotesHome ? (
          <div className="mt-2.5 flex w-full items-center gap-2">

            {/* ── Search + filter pill ── */}
            <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border border-zinc-200/80 bg-white/80 px-2.5 py-0 shadow-sm backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-900/60" style={{height:"40px"}}>

              {/* Filter chips — all sizes */}
              <div className="flex shrink-0 items-center gap-0.5">
                {([
                  { key: "company", short: "Cía",    full: "Compañía", title: "Buscar por compañía" },
                  { key: "pay",     short: "PAY",     full: "PAY",      title: "Buscar por Maker/Payee" },
                  { key: "status",  short: "Status",  full: "Status",   title: "Filtrar por status" },
                ] as const).map(({ key, short, full, title }) => {
                  const active = (qBy || "company") === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      title={title}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-black leading-none transition-all ${
                        active
                          ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      }`}
                    >
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{full}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />

              {/* Search / Status input */}
              {qBy === "status" ? (
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setParam("status", e.target.value); }}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-800 outline-none dark:text-zinc-100"
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
                  <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={qBy === "pay" ? "Buscar PAY…" : "Buscar compañía…"}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                  {q && (
                    <button onClick={() => setQ("")} className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </>
              )}

              {/* Mobile "⋯" menu */}
              <button
                type="button"
                onClick={() => setMobileActionsOpen((v) => !v)}
                title="Acciones"
                className={`ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition md:hidden ${
                  mobileActionsOpen
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {/* Mobile dropdown menu */}
              {mobileActionsOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/90 md:hidden">
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => { setMobileActionsOpen(false); try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {} router.replace("/app"); }}>
                    <FolderOpen className="h-4 w-4 text-zinc-400" />
                    Documentos
                  </button>
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => { setMobileActionsOpen(false); try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {}; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="9 11 12 14 22 4"/></svg>
                    {selectMode ? "Cancelar selección" : "Seleccionar"}
                  </button>
                  <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <Link href="/app/new" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setMobileActionsOpen(false)}>
                    <Plus className="h-4 w-4 text-zinc-400" />
                    Nueva nota
                  </Link>
                </div>
              )}
            </div>

            {/* ── Desktop action buttons ── */}
            <div className="hidden shrink-0 items-center gap-1.5 md:flex">
              <button type="button" title="Documentos"
                className="flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-200/80 bg-white/80 px-3 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-900"
                onClick={() => { try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {} router.replace("/app"); }}>
                <FolderOpen className="h-3.5 w-3.5" />
                Docs
              </button>
              <button type="button" title="Seleccionar varias"
                className="flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-200/80 bg-white/80 px-3 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-900"
                onClick={() => { try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {} }}>
                {selectMode ? "Cancelar" : "Seleccionar"}
              </button>
              <Link href="/app/new"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                title="Nueva nota">
                <Plus className="h-4 w-4" />
              </Link>
            </div>

          </div>
        ) : null}
      </div>
    </header>

    {/* ── PWA Install Banner ── */}
    {showInstallBanner && (
      <div
        style={{
          position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)",
          zIndex: 99999,
          width: "calc(100% - 32px)",
          maxWidth: "480px",
        }}
      >
        <div
          style={{
            width: "100%",
            background: "white",
            borderRadius: "20px",
            padding: "20px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Return Checks" style={{ width: "56px", height: "56px", borderRadius: "14px", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>Return Checks</p>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#6b7280" }}>Instala la app para acceso rápido</p>
            </div>
            <button
              onClick={() => setShowInstallBanner(false)}
              style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "#6b7280" }}
            >
              ×
            </button>
          </div>

          {/* Features */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["Sin conexión a internet", "Acceso desde pantalla de inicio", "Más rápida"].map((f) => (
              <span key={f} style={{ fontSize: "12px", fontWeight: 600, color: "#374151", background: "#f3f4f6", borderRadius: "20px", padding: "4px 10px" }}>
                ✓ {f}
              </span>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => setShowInstallBanner(false)}
              style={{ flex: 1, padding: "12px", borderRadius: "14px", border: "1px solid #e5e7eb", background: "white", fontSize: "14px", fontWeight: 600, color: "#6b7280", cursor: "pointer" }}
            >
              Ahora no
            </button>
            <button
              onClick={handleInstall}
              style={{ flex: 2, padding: "12px", borderRadius: "14px", border: "none", background: "linear-gradient(135deg, #111827, #374151)", fontSize: "14px", fontWeight: 700, color: "white", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}
            >
              Instalar app
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Logout Confirmation Modal ── */}
    {showLogoutModal && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/25 backdrop-blur-sm"
          onClick={() => setShowLogoutModal(false)}
        />
        {/* Card */}
        <div className="relative w-full max-w-xs overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
          style={{ animation: "scale-in .2s cubic-bezier(.34,1.56,.64,1) both" }}>
          {/* Top accent */}
          <div className="h-1.5 w-full bg-gradient-to-r from-red-400 via-red-500 to-red-400" />

          <div className="flex flex-col items-center px-6 pb-6 pt-5 text-center">
            {/* Logo */}
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <Image src="/logo.png" alt="Return Checks" width={44} height={44} className="rounded-xl object-contain" />
            </div>

            {/* Icon */}
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/50">
              <LogOut className="h-5 w-5 text-red-500" />
            </div>

            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">¿Cerrar sesión?</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Se cerrará tu sesión en este dispositivo.
            </p>

            {/* Actions */}
            <div className="mt-5 flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 rounded-2xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => logoutFormRef.current?.submit()}
                className="flex-1 rounded-2xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 active:scale-95"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  );
}

