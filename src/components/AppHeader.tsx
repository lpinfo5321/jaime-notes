"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckSquare,
  FolderOpen,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  X,
  Download,
  WifiOff,
  Zap,
  Smartphone,
} from "lucide-react";
import { useTheme } from "next-themes";
import { RefreshCw } from "lucide-react";
import { useDesign } from "@/lib/useDesign";
import { DISABLE_RESUME_ONCE_KEY, LAST_ROUTE_KEY } from "@/components/ResumeGate";

const SELECT_MODE_KEY = "rc:selectMode:v1";

type ActiveView = "home" | "contacts" | "documents";

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
  const [activeView,       setActiveView]       = useState<ActiveView>("home");
  const design = useDesign();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = mounted && resolvedTheme === "dark";

  const logoutFormRef = useRef<HTMLFormElement>(null);
  const menuRef       = useRef<HTMLDivElement>(null);

  // Client-side mount flag (needed for createPortal)
  useEffect(() => { setMounted(true); }, []);

  // La lista de notas avisa qué vista está activa (solo para resaltar la navegación)
  useEffect(() => {
    const onView = (ev: any) => {
      const v = ev?.detail?.view;
      if (v === "home" || v === "contacts" || v === "documents") setActiveView(v);
    };
    window.addEventListener("rc:viewChanged" as any, onView as any);
    return () => window.removeEventListener("rc:viewChanged" as any, onView as any);
  }, []);

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

  function showContacts() {
    try { window.dispatchEvent(new CustomEvent("rc:showContacts")); } catch {}
    router.replace("/app");
  }

  function showDocuments() {
    try { window.dispatchEvent(new CustomEvent("rc:showDocuments")); } catch {}
    router.replace("/app");
  }

  const onApp = pathname === "/app";
  const navItems: {
    key: ActiveView;
    label: string;
    title: string;
    icon: React.ReactNode;
    onClick: () => void;
  }[] = [
    { key: "home",      label: "Inicio",    title: "Dashboard",  icon: <Home       className="h-4 w-4 shrink-0" />, onClick: goHome },
    { key: "contacts",  label: "Contactos", title: "Contactos",  icon: <Users      className="h-4 w-4 shrink-0" />, onClick: showContacts },
    { key: "documents", label: "Docs",      title: "Documentos", icon: <FolderOpen className="h-4 w-4 shrink-0" />, onClick: showDocuments },
  ];

  const [updState, setUpdState] = useState<"idle" | "checking" | "uptodate" | "updating">("idle");
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
  const buildLabel = (() => {
    const d = new Date(buildId);
    return Number.isNaN(d.getTime())
      ? "desarrollo"
      : d.toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  })();

  /** Busca versión nueva en el servidor; si la hay limpia cachés y recarga. */
  async function checkUpdate() {
    setUpdState("checking");
    let newer = false;
    try {
      const res = await fetch("/api/version?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      if (data?.v && data.v !== buildId) newer = true;
    } catch {}
    if (!newer) {
      setUpdState("uptodate");
      window.setTimeout(() => setUpdState("idle"), 3500);
      return;
    }
    setUpdState("updating");
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.unregister()));
      const keys = await caches?.keys?.();
      await Promise.all((keys ?? []).map((k) => caches.delete(k)));
    } catch {}
    window.location.href = window.location.pathname + "?v=" + Date.now();
  }

  const menuItemCls =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]";

  return (
    <>
    {/* ═══════════════════════════════ HEADER ═══════════════════════════════ */}
    <header className="app-header surface-glass sticky top-0 z-20 border-x-0 border-t-0 !shadow-none">
      <div className="mx-auto max-w-6xl px-3 sm:px-5">

        {/* ── Row 1: Brand + Nav + Actions ── */}
        <div className="flex h-16 items-center gap-3">

          {/* Brand */}
          <Link href="/app" className="group flex shrink-0 items-center gap-2.5">
            <span className="relative">
              <Image
                src="/logo.png"
                alt="Return Checks"
                width={38}
                height={38}
                className="rounded-[14px] bg-white object-contain p-0.5 shadow-md ring-1 ring-black/5 transition group-hover:scale-105 dark:ring-white/10"
                priority
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-lime-400 dark:border-[#0b0f18]" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[15px] font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Return Checks
              </span>
              <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Cheques retornados
              </span>
            </span>
          </Link>

          {/* ── Nav (segmented pills) ── */}
          <nav className="ml-1 flex items-center gap-0.5 rounded-2xl bg-zinc-100/90 p-1 ring-1 ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/[0.06] sm:ml-3">
            {navItems.map((it) => {
              const active = onApp && activeView === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={it.onClick}
                  title={it.title}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-all ${
                    active
                      ? "bg-white text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.08)] dark:bg-white/[0.12] dark:text-white dark:shadow-none"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  <span className={active ? "text-lime-600 dark:text-lime-300" : ""}>{it.icon}</span>
                  <span className="hidden sm:inline">{it.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Right actions ── */}
          <div className="flex items-center gap-1.5">

            {/* Quick theme toggle (desktop) */}
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Modo claro" : "Modo oscuro"}
              className="hidden h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white sm:flex"
            >
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {/* User menu button */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                title="Menú"
                className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
                  menuOpen
                    ? "btn-ink"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                }`}
              >
                <Settings className={`h-[18px] w-[18px] transition-transform duration-300 ${menuOpen ? "rotate-90" : ""}`} />
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="animate-scale-in absolute right-0 top-[calc(100%+8px)] z-50 w-60 origin-top-right overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#0d121c]/95">
                  <div className="mb-1 flex items-center gap-3 rounded-2xl bg-zinc-50 px-3 py-3 dark:bg-white/[0.04]">
                    <Image src="/logo.png" alt="" width={34} height={34} className="rounded-xl bg-white object-contain p-0.5 shadow-sm" />
                    <div>
                      <p className="text-sm font-extrabold leading-tight text-zinc-900 dark:text-white">Return Checks</p>
                      <p className="text-[11px] font-medium text-zinc-400">Versión del {buildLabel}</p>
                    </div>
                  </div>

                  <button type="button" onClick={() => { setMenuOpen(false); goHome(); }} className={menuItemCls}>
                    <Home className="h-4 w-4 text-zinc-400" /> Dashboard
                  </button>

                  <button type="button" onClick={() => { setMenuOpen(false); showContacts(); }} className={menuItemCls}>
                    <Users className="h-4 w-4 text-zinc-400" /> Contactos
                  </button>

                  <button type="button" onClick={() => { setMenuOpen(false); showDocuments(); }} className={menuItemCls}>
                    <FolderOpen className="h-4 w-4 text-zinc-400" /> Documentos
                  </button>

                  <div className="mx-2 my-1.5 h-px bg-zinc-100 dark:bg-white/[0.07]" />

                  {/* Theme toggle */}
                  <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className={menuItemCls}>
                    {isDark
                      ? <><Sun className="h-4 w-4 text-amber-400" /> Modo claro</>
                      : <><Moon className="h-4 w-4 text-indigo-400" /> Modo oscuro</>}
                  </button>

                  <div className="mx-2 my-1.5 h-px bg-zinc-100 dark:bg-white/[0.07]" />

                  <button type="button" onClick={() => void checkUpdate()} disabled={updState === "checking" || updState === "updating"} className={menuItemCls}>
                    <RefreshCw className={`h-4 w-4 text-zinc-400 ${updState === "checking" || updState === "updating" ? "animate-spin" : ""}`} />
                    {updState === "checking" ? "Buscando…" : updState === "updating" ? "Actualizando…" : updState === "uptodate" ? "✓ Ya tienes la última" : "Buscar actualización"}
                  </button>

                  <div className="mx-2 my-1.5 h-px bg-zinc-100 dark:bg-white/[0.07]" />

                  <button type="button" onClick={() => { setMenuOpen(false); setShowLogoutModal(true); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10">
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Search bar (only on /app) ── */}
        {isNotesHome ? (
          <div className="flex w-full items-center gap-2 pb-3">

            {/* Search + filter */}
            <div className="relative flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 px-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition focus-within:border-lime-400/70 focus-within:shadow-[0_0_0_4px_rgba(132,204,22,0.15)] dark:border-white/10 dark:bg-white/[0.04]">

              {/* Filter chips */}
              <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-zinc-100 p-0.5 dark:bg-white/[0.06]">
                {([
                  { key: "company", short: "Cía",   full: "Compañía", title: "Buscar por compañía" },
                  { key: "pay",     short: "PAY",    full: "PAY",      title: "Buscar por Maker/Payee" },
                  { key: "status",  short: "Status", full: "Status",   title: "Filtrar por status" },
                ] as const).map(({ key, short, full, title }) => {
                  const active = (qBy || "company") === key;
                  return (
                    <button key={key} type="button" onClick={() => setMode(key)} title={title}
                      className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-bold leading-none transition-all ${
                        active
                          ? "bg-white text-zinc-900 shadow-[0_1px_3px_rgba(15,23,42,0.12)] dark:bg-white/15 dark:text-white dark:shadow-none"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}>
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{full}</span>
                    </button>
                  );
                })}
              </div>

              {/* Input */}
              {qBy === "status" ? (
                <select value={status} onChange={(e) => { setStatus(e.target.value); setParam("status", e.target.value); }}
                  className="h-full min-w-0 flex-1 cursor-pointer bg-transparent px-1 text-sm font-semibold text-zinc-800 outline-none dark:text-zinc-100">
                  <option value="">Todos</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid Cash">Paid Cash</option>
                  <option value="Paid Check">Paid Check</option>
                  <option value="Redeposited">Redeposited</option>
                </select>
              ) : (
                <>
                  <Search className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder={qBy === "pay" ? "Buscar PAY…" : "Buscar compañía…"}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
                  {q && (
                    <button onClick={() => setQ("")} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/20">
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </>
              )}

              {/* Mobile ⋯ menu */}
              <button type="button" onClick={() => setMobileActionsOpen((v) => !v)} title="Acciones"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition md:hidden ${
                  mobileActionsOpen ? "btn-ink" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                }`}>
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {mobileActionsOpen && (
                <div className="animate-scale-in absolute right-0 top-[calc(100%+8px)] z-30 w-56 origin-top-right overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#0d121c]/95 md:hidden">
                  <button type="button" className={menuItemCls}
                    onClick={() => { setMobileActionsOpen(false); try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {} }}>
                    <CheckSquare className="h-4 w-4 text-zinc-400" />
                    {selectMode ? "Cancelar selección" : "Seleccionar"}
                  </button>
                  <div className="mx-2 my-1 h-px bg-zinc-100 dark:bg-white/[0.07]" />
                  <Link href="/app/new" className={menuItemCls} onClick={() => setMobileActionsOpen(false)}>
                    <Plus className="h-4 w-4 text-zinc-400" /> Nueva nota
                  </Link>
                </div>
              )}
            </div>

            {/* Desktop action buttons */}
            <div className="hidden shrink-0 items-center gap-2 md:flex">
              <button type="button" title="Seleccionar varias"
                className="flex h-12 items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 px-4 text-[13px] font-semibold text-zinc-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                onClick={() => { try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {} }}>
                <CheckSquare className="h-4 w-4 text-zinc-400" />
                {selectMode ? "Cancelar" : "Seleccionar"}
              </button>
              <Link href="/app/new"
                className="btn-brand flex h-12 items-center gap-2 rounded-2xl px-5 text-[13px]"
                title="Nueva nota">
                <Plus className="h-4 w-4" strokeWidth={3} />
                Nueva
              </Link>
            </div>

          </div>
        ) : null}

      </div>
    </header>

    {/* ═════════ DISEÑO "PANEL": barra lateral (solo escritorio) ═════════ */}
    {design === "panel" && (
      <aside className="app-sidebar flex-col gap-1 border-r border-slate-200/80 bg-white/90 p-4 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0a0e16]/90">
        <Link href="/app" className="mb-4 flex items-center gap-3 px-1.5 pt-1">
          <Image src="/logo.png" alt="Return Checks" width={40} height={40} className="rounded-[14px] bg-white object-contain p-0.5 shadow-md ring-1 ring-black/5" />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-white">Return Checks</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cheques retornados</span>
          </span>
        </Link>

        <Link href="/app/new" className="btn-brand mb-3 flex h-11 items-center justify-center gap-2 rounded-xl text-[13px]">
          <Plus className="h-4 w-4" strokeWidth={3} /> Nueva nota
        </Link>

        {isNotesHome ? (
          <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex items-center gap-2 px-1.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              {qBy === "status" ? (
                <select value={status} onChange={(e) => { setStatus(e.target.value); setParam("status", e.target.value); }}
                  className="h-9 min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-100">
                  <option value="">Todos</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid Cash">Paid Cash</option>
                  <option value="Paid Check">Paid Check</option>
                  <option value="Redeposited">Redeposited</option>
                </select>
              ) : (
                <input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={qBy === "pay" ? "Buscar PAY…" : "Buscar compañía…"}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-slate-400" />
              )}
            </div>
            <div className="mt-1.5 flex gap-0.5 rounded-lg bg-slate-200/60 p-0.5 dark:bg-white/[0.06]">
              {([
                { key: "company", label: "Compañía" },
                { key: "pay", label: "PAY" },
                { key: "status", label: "Status" },
              ] as const).map(({ key, label }) => {
                const active = (qBy || "company") === key;
                return (
                  <button key={key} type="button" onClick={() => setMode(key)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${
                      active ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Menú</p>
        {navItems.map((it) => {
          const active = onApp && activeView === it.key;
          return (
            <button key={it.key} type="button" onClick={it.onClick}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold transition ${
                active
                  ? "bg-slate-900 text-white shadow-sm dark:bg-white/[0.12]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}>
              {it.icon}
              {it.title}
            </button>
          );
        })}
        {isNotesHome ? (
          <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent("rc:toggleSelectMode")); } catch {} }}
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white">
            <CheckSquare className="h-4 w-4 shrink-0" />
            {selectMode ? "Cancelar selección" : "Seleccionar"}
          </button>
        ) : null}

        <div className="flex-1" />
        <div className="mt-2 border-t border-slate-200/80 pt-3 dark:border-white/[0.07]">
          <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Modo claro" : "Modo oscuro"}
          </button>
          <button type="button" onClick={() => setShowLogoutModal(true)}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>
    )}

    {/* ═════════ DISEÑO "BENTO": barra inferior tipo app (solo móvil) ═════════ */}
    {design === "bento" && (
      <nav className="app-bottomnav items-center justify-around rounded-[26px] border border-slate-200/80 bg-white/90 px-2 py-2 shadow-[0_16px_48px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0d121c]/90">
        {[navItems[0], navItems[1]].map((it) => {
          const active = onApp && activeView === it.key;
          return (
            <button key={it.key} type="button" onClick={it.onClick}
              className={`flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-bold transition ${active ? "text-lime-600 dark:text-lime-300" : "text-slate-400"}`}>
              {it.icon}{it.label}
            </button>
          );
        })}
        <Link href="/app/new" className="btn-brand -mt-8 flex h-14 w-14 items-center justify-center rounded-full" title="Nueva nota">
          <Plus className="h-6 w-6" strokeWidth={3} />
        </Link>
        {[navItems[2]].map((it) => {
          const active = onApp && activeView === it.key;
          return (
            <button key={it.key} type="button" onClick={it.onClick}
              className={`flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-bold transition ${active ? "text-lime-600 dark:text-lime-300" : "text-slate-400"}`}>
              {it.icon}{it.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-bold text-slate-400">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}Tema
        </button>
      </nav>
    )}

    {/* Hidden logout form */}
    <form ref={logoutFormRef} action="/auth/logout" method="post" style={{ display: "none" }} />

    {/* ── PWA Install Banner ── */}
    {showInstallBanner && (
      <div className="animate-slide-up fixed bottom-4 left-1/2 z-[99999] w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2">
        <div className="flex flex-col gap-4 rounded-[28px] border border-zinc-200/70 bg-white/95 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0d121c]/95">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Return Checks" className="h-14 w-14 shrink-0 rounded-2xl shadow-md" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-zinc-900 dark:text-white">Return Checks</p>
              <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">Instala la app para acceso rápido</p>
            </div>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { t: "Sin conexión a internet", i: <WifiOff className="h-3 w-3" /> },
              { t: "Acceso desde pantalla de inicio", i: <Smartphone className="h-3 w-3" /> },
              { t: "Más rápida", i: <Zap className="h-3 w-3" /> },
            ].map((f) => (
              <span key={f.t} className="inline-flex items-center gap-1.5 rounded-full bg-lime-50 px-2.5 py-1 text-xs font-semibold text-lime-800 ring-1 ring-lime-200 dark:bg-lime-400/10 dark:text-lime-200 dark:ring-lime-400/20">
                {f.i} {f.t}
              </span>
            ))}
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setShowInstallBanner(false)}
              className="flex-1 rounded-2xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Ahora no
            </button>
            <button
              onClick={handleInstall}
              className="btn-ink flex flex-[2] items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold"
            >
              <Download className="h-4 w-4" /> Instalar app
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Logout Confirmation Modal ── */}
    {showLogoutModal && mounted && createPortal(
      <div
        onClick={(e) => { if (e.target === e.currentTarget) setShowLogoutModal(false); }}
        className="overlay-backdrop animate-fade-in"
        style={{
          position: "fixed", inset: 0, zIndex: 999999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          className="animate-scale-in relative w-full max-w-[340px] overflow-hidden rounded-[28px] border border-zinc-200/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.30)] dark:border-white/10 dark:bg-[#0d121c]"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.14),transparent_70%)]" />

          <div className="relative flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-8 ring-red-50/60 dark:bg-red-500/10 dark:ring-red-500/5">
              <LogOut className="h-6 w-6" />
            </div>

            <p className="mt-5 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">¿Cerrar sesión?</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Se cerrará tu sesión en este dispositivo.
            </p>

            <div className="mt-6 flex w-full gap-2.5">
              <button type="button" onClick={() => setShowLogoutModal(false)}
                className="flex-1 rounded-2xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button type="button" onClick={() => logoutFormRef.current?.submit()}
                className="flex-1 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition hover:brightness-110"
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
