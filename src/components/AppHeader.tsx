"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Home, LogOut, MoreHorizontal, Plus, Search, Settings, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { DISABLE_RESUME_ONCE_KEY, LAST_ROUTE_KEY } from "@/components/ResumeGate";

const SELECT_MODE_KEY = "rc:selectMode:v1";

export default function AppHeader() {
  const pathname  = usePathname();
  const router    = useRouter();
  const sp        = useSearchParams();

  const isNotesHome = pathname === "/app";

  const [q,                setQ]                = useState(sp.get("q") ?? "");
  const [selectMode,       setSelectMode]       = useState(false);
  const [qBy,              setQBy]              = useState(sp.get("qBy") ?? "company");
  const [status,           setStatus]           = useState(sp.get("status") ?? "");
  const [mobileActionsOpen,setMobileActionsOpen]= useState(false);
  const [installPrompt,    setInstallPrompt]    = useState<any>(null);
  const [showInstallBanner,setShowInstallBanner]= useState(false);
  const [showLogoutModal,  setShowLogoutModal]  = useState(false);
  const [menuOpen,         setMenuOpen]         = useState(false);
  const [mounted,          setMounted]          = useState(false);

  const logoutFormRef = useRef<HTMLFormElement>(null);
  const menuRef       = useRef<HTMLDivElement>(null);

  // Client-side mount flag (needed for createPortal)
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setQBy(sp.get("qBy") ?? "company");
    setStatus(sp.get("status") ?? "");
    setMobileActionsOpen(false);
    setMenuOpen(false);
  }, [sp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { setSelectMode(window.localStorage.getItem(SELECT_MODE_KEY) === "1"); } catch {}
    const onChanged = (ev: any) => {
      try { setSelectMode(!!ev?.detail?.selectMode); } catch {}
    };
    window.addEventListener("rc:selectModeChanged" as any, onChanged as any);
    return () => window.removeEventListener("rc:selectModeChanged" as any, onChanged as any);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!window.matchMedia("(display-mode: standalone)").matches) setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setShowInstallBanner(false); setInstallPrompt(null); }
  }

  useEffect(() => {
    if (!isNotesHome) return;
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(sp);
      if (qBy !== "status") {
        if (q.trim()) params.set("q", q.trim()); else params.delete("q");
      } else { params.delete("q"); }
      if (qBy && qBy !== "company") params.set("qBy", qBy); else params.delete("qBy");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, qBy, isNotesHome]);

  function setParam(key: string, value?: string) {
    const params = new URLSearchParams(sp);
    if (!value) params.delete(key); else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setMode(next: "company" | "pay" | "status") {
    setQBy(next);
    const params = new URLSearchParams(sp);
    if (next === "company") params.delete("qBy"); else params.set("qBy", next);
    if (next === "status") { params.delete("q"); } else { params.delete("status"); }
    router.replace(`${pathname}?${params.toString()}`);
  }

  function goHome() {
    try {
      window.sessionStorage.setItem(DISABLE_RESUME_ONCE_KEY, "1");
      window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ v: 1, ts: Date.now(), url: "/app" }));
      window.localStorage.setItem("rc:lastAppLocation:v1", JSON.stringify({ v: 1, ts: Date.now(), bucket: "pending", view: "list", scrollY: 0 }));
      window.dispatchEvent(new CustomEvent("rc:goToDashboard"));
      window.scrollTo(0, 0);
    } catch {}
    router.replace("/app");
  }

  return (
    <>
    {/* ═══════════════════════════════ HEADER ═══════════════════════════════ */}
    <header className="sticky top-0 z-20 border-b border-zinc-200/60 bg-white/70 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-950/60">
      <div className="mx-auto max-w-6xl px-3 sm:px-5">

        {/* ── Row 1: Brand + Nav + Actions ── */}
        <div className="flex h-14 items-center gap-2">

          {/* Brand */}
          <Link href="/app" className="flex shrink-0 items-center gap-2.5 mr-1">
            <Image
              src="/logo.png"
              alt="Return Checks"
              width={34}
              height={34}
              className="rounded-xl object-contain shadow-sm"
              priority
            />
            <span className="hidden text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:inline">
              Return Checks
            </span>
          </Link>

          {/* Divider (desktop) */}
          <div className="hidden h-5 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />

          {/* ── Nav pills ── */}
          <nav className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={goHome}
              title="Dashboard"
              className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Home className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Inicio</span>
            </button>

            <button
              type="button"
              title="Contactos"
              onClick={() => {
                try { window.dispatchEvent(new CustomEvent("rc:showContacts")); } catch {}
                router.replace("/app");
              }}
              className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Contactos</span>
            </button>

            <button
              type="button"
              title="Documentos"
              onClick={() => {
                try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {}
                router.replace("/app");
              }}
              className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Docs</span>
            </button>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Right actions ── */}
          <div className="flex items-center gap-1">
            <ThemeToggle />

            {/* User menu button */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                title="Menú"
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                  menuOpen
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                <Settings className="h-4 w-4" />
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 py-1.5 shadow-xl backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/95">
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Return Checks</p>
                    <p className="text-[11px] text-zinc-400">v1.0</p>
                  </div>

                  <button type="button" onClick={() => { setMenuOpen(false); goHome(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900">
                    <Home className="h-4 w-4 text-zinc-400" /> Dashboard
                  </button>

                  <button type="button" onClick={() => { setMenuOpen(false); try { window.dispatchEvent(new CustomEvent("rc:showContacts")); } catch {} router.replace("/app"); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900">
                    <Users className="h-4 w-4 text-zinc-400" /> Contactos
                  </button>

                  <button type="button" onClick={() => { setMenuOpen(false); try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {} router.replace("/app"); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900">
                    <FolderOpen className="h-4 w-4 text-zinc-400" /> Documentos
                  </button>

                  <div className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-800" />

                  <button type="button" onClick={() => { setMenuOpen(false); setShowLogoutModal(true); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Search bar (only on /app) ── */}
        {isNotesHome ? (
          <div className="flex w-full items-center gap-2 pb-2.5">

            {/* Search + filter */}
            <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border border-zinc-200/80 bg-white/80 px-2.5 shadow-sm backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-900/60" style={{ height: "40px" }}>

              {/* Filter chips */}
              <div className="flex shrink-0 items-center gap-0.5">
                {([
                  { key: "company", short: "Cía",   full: "Compañía", title: "Buscar por compañía" },
                  { key: "pay",     short: "PAY",    full: "PAY",      title: "Buscar por Maker/Payee" },
                  { key: "status",  short: "Status", full: "Status",   title: "Filtrar por status" },
                ] as const).map(({ key, short, full, title }) => {
                  const active = (qBy || "company") === key;
                  return (
                    <button key={key} type="button" onClick={() => setMode(key)} title={title}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-black leading-none transition-all ${
                        active
                          ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      }`}>
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{full}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />

              {/* Input */}
              {qBy === "status" ? (
                <select value={status} onChange={(e) => { setStatus(e.target.value); setParam("status", e.target.value); }}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-800 outline-none dark:text-zinc-100">
                  <option value="">Todos</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid Cash">Paid Cash</option>
                  <option value="Paid Check">Paid Check</option>
                  <option value="Redeposited">Redeposited</option>
                </select>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder={qBy === "pay" ? "Buscar PAY…" : "Buscar compañía…"}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                  {q && (
                    <button onClick={() => setQ("")} className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </>
              )}

              {/* Mobile ⋯ menu */}
              <button type="button" onClick={() => setMobileActionsOpen((v) => !v)} title="Acciones"
                className={`ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition md:hidden ${
                  mobileActionsOpen ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}>
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {mobileActionsOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/90 md:hidden">
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => { setMobileActionsOpen(false); try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {} router.replace("/app"); }}>
                    <FolderOpen className="h-4 w-4 text-zinc-400" /> Documentos
                  </button>
                  <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => { setMobileActionsOpen(false); try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {} }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="9 11 12 14 22 4"/></svg>
                    {selectMode ? "Cancelar selección" : "Seleccionar"}
                  </button>
                  <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <Link href="/app/new" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setMobileActionsOpen(false)}>
                    <Plus className="h-4 w-4 text-zinc-400" /> Nueva nota
                  </Link>
                </div>
              )}
            </div>

            {/* Desktop action buttons */}
            <div className="hidden shrink-0 items-center gap-1.5 md:flex">
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

    {/* Hidden logout form */}
    <form ref={logoutFormRef} action="/auth/logout" method="post" style={{ display: "none" }} />

    {/* ── PWA Install Banner ── */}
    {showInstallBanner && (
      <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 99999, width: "calc(100% - 32px)", maxWidth: "480px" }}>
        <div style={{ width: "100%", background: "white", borderRadius: "20px", padding: "20px", boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Return Checks" style={{ width: "56px", height: "56px", borderRadius: "14px", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>Return Checks</p>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#6b7280" }}>Instala la app para acceso rápido</p>
            </div>
            <button onClick={() => setShowInstallBanner(false)} style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "#6b7280" }}>×</button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["Sin conexión a internet", "Acceso desde pantalla de inicio", "Más rápida"].map((f) => (
              <span key={f} style={{ fontSize: "12px", fontWeight: 600, color: "#374151", background: "#f3f4f6", borderRadius: "20px", padding: "4px 10px" }}>✓ {f}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setShowInstallBanner(false)} style={{ flex: 1, padding: "12px", borderRadius: "14px", border: "1px solid #e5e7eb", background: "white", fontSize: "14px", fontWeight: 600, color: "#6b7280", cursor: "pointer" }}>Ahora no</button>
            <button onClick={handleInstall} style={{ flex: 2, padding: "12px", borderRadius: "14px", border: "none", background: "linear-gradient(135deg, #111827, #374151)", fontSize: "14px", fontWeight: 700, color: "white", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>Instalar app</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Logout Confirmation Modal ── */}
    {showLogoutModal && mounted && createPortal(
      <div
        onClick={(e) => { if (e.target === e.currentTarget) setShowLogoutModal(false); }}
        style={{
          position: "fixed", inset: 0, zIndex: 999999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
          background: "rgba(0,0,0,0.12)",
        }}
      >
        <div style={{
          position: "relative", width: "100%", maxWidth: "320px",
          background: "white", borderRadius: "24px", overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          animation: "scale-in .2s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          {/* Top accent bar */}
          <div style={{ height: "4px", background: "linear-gradient(90deg, #f87171, #ef4444, #f87171)" }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 24px 24px", textAlign: "center", gap: "0" }}>
            {/* Logo */}
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Return Checks" style={{ width: "40px", height: "40px", borderRadius: "10px", objectFit: "contain" }} />
            </div>

            {/* Icon */}
            <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>

            <p style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#111827" }}>¿Cerrar sesión?</p>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
              Se cerrará tu sesión en este dispositivo.
            </p>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "10px", width: "100%", marginTop: "24px" }}>
              <button type="button" onClick={() => setShowLogoutModal(false)}
                style={{ flex: 1, padding: "11px", borderRadius: "14px", border: "1.5px solid #e5e7eb", background: "white", fontSize: "14px", fontWeight: 600, color: "#6b7280", cursor: "pointer", transition: "background .15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
              >
                Cancelar
              </button>
              <button type="button" onClick={() => logoutFormRef.current?.submit()}
                style={{ flex: 1, padding: "11px", borderRadius: "14px", border: "none", background: "linear-gradient(135deg, #ef4444, #dc2626)", fontSize: "14px", fontWeight: 700, color: "white", cursor: "pointer", boxShadow: "0 4px 14px rgba(239,68,68,0.35)", transition: "opacity .15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
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
