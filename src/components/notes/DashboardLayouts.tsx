"use client";

import { ArrowUpRight, Building2, CheckCircle2, Clock, Plus, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Design } from "@/lib/useDesign";

/** Datos mínimos que necesitan los diseños nuevos (los mismos del dashboard clásico). */
export type DashGroup = {
  name: string;
  totalDueCents: number;
  pendingCount: number;
  completedCount: number;
  lastActivity: string;
  latestEntryDate: string;
  latestEntryAgent: string;
  latestEntryText: string;
};

type Handlers<G extends DashGroup> = {
  groups: G[];
  onOpen: (g: G) => void;
  onOpenNotes: (g: G) => void;
  onQuickAdd: (g: G) => void;
};

/* ───────────── utilidades ───────────── */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtUsd = (cents: number) => usd.format(cents / 100);
const fmtUsdShort = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  return usd.format(v);
};
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}
function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
function avatarBg(name: string, paid: boolean) {
  if (paid) return "linear-gradient(135deg,#34d399,#0d9488)";
  const h = hue(name);
  return `linear-gradient(135deg,hsl(${h} 78% 60%),hsl(${(h + 45) % 360} 74% 46%))`;
}
function dateShort(iso: string) {
  if (!iso) return "—";
  // "YYYY-MM-DD" se interpreta como fecha local para no desfasar un día por la zona horaria
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function excerptOf(t: string, n = 110) {
  return t.replace(/\s+/g, " ").slice(0, n);
}
function progressOf(g: DashGroup) {
  const total = g.pendingCount + g.completedCount;
  return { total, pct: total ? Math.round((g.completedCount / total) * 100) : 0 };
}

/* ═════════════════════ RESUMEN SUPERIOR (KPIs) ═════════════════════ */
export function DashboardHero({ groups, design }: { groups: DashGroup[]; design: Design }) {
  const due = groups.reduce((s, g) => s + g.totalDueCents, 0);
  const pending = groups.reduce((s, g) => s + g.pendingCount, 0);
  const paid = groups.reduce((s, g) => s + g.completedCount, 0);
  const all = pending + paid;
  const pct = all ? Math.round((paid / all) * 100) : 0;

  if (design === "bento") {
    return (
      <section className="animate-fade-in mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Tarjeta principal oscura con brillo de la marca */}
        <div className="relative overflow-hidden rounded-[32px] bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(2,6,23,0.35)] sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl" style={{ background: "var(--brand)" }} />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
              <Wallet className="h-4 w-4" /> Total por cobrar
            </div>
            <p className="mt-3 text-[44px] font-black leading-none tracking-tight tabular-nums sm:text-6xl">{fmtUsd(due)}</p>
            <p className="mt-3 text-sm text-white/60">
              en <b className="text-white">{groups.length}</b> {groups.length === 1 ? "compañía" : "compañías"} · <b className="text-white">{pending}</b> cheques pendientes
            </p>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-white/70">
                <span>Recuperado</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "var(--brand-gradient)" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <MiniStat icon={<Building2 className="h-4 w-4" />} label="Compañías" value={String(groups.length)} tone="slate" />
          <MiniStat icon={<Clock className="h-4 w-4" />} label="Pendientes" value={String(pending)} tone="red" />
          <MiniStat icon={<CheckCircle2 className="h-4 w-4" />} label="Pagados" value={String(paid)} tone="green" />
        </div>
      </section>
    );
  }

  // panel
  return (
    <section className="animate-fade-in mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label="Total por cobrar" value={fmtUsdShort(due)} icon={<Wallet className="h-4 w-4" />} tone="brand" hint={`${pct}% recuperado`} />
      <KpiTile label="Compañías" value={String(groups.length)} icon={<Building2 className="h-4 w-4" />} tone="slate" hint="con actividad" />
      <KpiTile label="Pendientes" value={String(pending)} icon={<Clock className="h-4 w-4" />} tone="red" hint="cheques sin cobrar" />
      <KpiTile label="Pagados" value={String(paid)} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" hint="cheques cobrados" />
    </section>
  );
}

const toneBox: Record<string, string> = {
  brand: "bg-lime-100 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  red: "bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300",
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
};

function KpiTile({ label, value, icon, tone, hint }: { label: string; value: string; icon: React.ReactNode; tone: keyof typeof toneBox; hint: string }) {
  return (
    <div className="kpi-tile rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.07] dark:bg-[#0e131d]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", toneBox[tone])}>{icon}</span>
      </div>
      <p className="mt-3 text-[28px] font-black leading-none tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: keyof typeof toneBox }) {
  return (
    <div className="flex flex-col justify-center rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/[0.07] dark:bg-[#0e131d] sm:p-5 lg:flex-row lg:items-center lg:gap-4">
      <span className={cn("mb-2 flex h-10 w-10 items-center justify-center rounded-2xl lg:mb-0", toneBox[tone])}>{icon}</span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-2xl font-black leading-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

/* ═════════════════════ DISEÑO "PANEL": filas tipo tabla ═════════════════════ */
export function CompanyRows<G extends DashGroup>({ groups, onOpen, onOpenNotes, onQuickAdd }: Handlers<G>) {
  const cols = "md:grid-cols-[minmax(0,2fr)_minmax(0,2.3fr)_150px_150px_130px]";
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.07] dark:bg-[#0e131d]">
      <div className={cn("hidden items-center gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-500 md:grid", cols)}>
        <span>Compañía</span>
        <span>Última nota</span>
        <span>Estado</span>
        <span>Cobro</span>
        <span className="text-right">Total due</span>
      </div>

      <div className="stagger-children divide-y divide-slate-100 dark:divide-white/[0.05]">
        {groups.map((g) => {
          const allPaid = g.pendingCount === 0 && g.completedCount > 0;
          const { total, pct } = progressOf(g);
          return (
            <div
              key={g.name}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(g)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g); } }}
              className={cn(
                "company-row group relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors sm:px-5",
                "hover:bg-slate-50 dark:hover:bg-white/[0.035] focus:outline-none focus-visible:bg-slate-50",
                "md:grid-cols-[minmax(0,2fr)_minmax(0,2.3fr)_150px_150px_130px]",
              )}
            >
              {/* barra de acento a la izquierda al pasar el mouse */}
              <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100", allPaid ? "bg-emerald-400" : "bg-red-400")} />

              {/* compañía */}
              <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[13px] font-extrabold text-white shadow-sm" style={{ background: avatarBg(g.name, allPaid) }}>
                  {initials(g.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold uppercase tracking-tight text-slate-900 dark:text-white">{g.name}</p>
                  <p className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">Actividad · {dateShort(g.lastActivity)}</p>
                </div>
              </div>

              {/* total (móvil: arriba a la derecha) */}
              <div className="text-right md:order-last">
                <p className={cn("text-[17px] font-black tabular-nums tracking-tight sm:text-lg", allPaid ? "text-emerald-600 dark:text-emerald-300" : "text-slate-900 dark:text-white")}>{fmtUsd(g.totalDueCents)}</p>
              </div>

              {/* última nota */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenNotes(g); }}
                className="col-span-3 min-w-0 rounded-lg text-left md:col-span-1 md:-mx-2 md:px-2 md:py-1 md:hover:bg-slate-100 dark:md:hover:bg-white/[0.06]"
              >
                <p className="truncate text-[13px] text-slate-600 dark:text-slate-300">
                  {excerptOf(g.latestEntryText) || <span className="italic text-slate-400">(sin contenido)</span>}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {g.latestEntryAgent ? <b className="font-bold text-slate-500 dark:text-slate-400">{g.latestEntryAgent}</b> : null}
                  {g.latestEntryAgent && g.latestEntryDate ? " · " : ""}
                  {g.latestEntryDate ? dateShort(g.latestEntryDate) : ""}
                </p>
              </button>

              {/* estado */}
              <div className="col-span-1 md:col-span-1">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
                  allPaid
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25"
                    : "bg-red-50 text-red-600 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25",
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", allPaid ? "bg-emerald-500" : "bg-red-500")} />
                  {allPaid ? "Pagado" : `${g.pendingCount} pendiente${g.pendingCount === 1 ? "" : "s"}`}
                </span>
              </div>

              {/* cobro */}
              <div className="col-span-1 flex items-center gap-2.5 md:col-span-1">
                <div className="h-1.5 w-full max-w-[84px] overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className={cn("h-full rounded-full", allPaid ? "bg-emerald-500" : "bg-lime-500")} style={{ width: `${pct}%` }} />
                </div>
                <span className="whitespace-nowrap text-[11.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{g.completedCount}/{total}</span>
                {/* acción rápida */}
                <button
                  type="button"
                  title="Agregar nota rápida"
                  onClick={(e) => { e.stopPropagation(); onQuickAdd(g); }}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-lime-100 hover:text-lime-700 dark:bg-white/10 dark:text-slate-300 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═════════════════════ DISEÑO "BENTO": tarjetas con tamaños distintos ═════════════════════ */
export function CompanyBento<G extends DashGroup>({ groups, onOpen, onOpenNotes, onQuickAdd }: Handlers<G>) {
  // La compañía con más deuda pendiente se destaca en grande
  let featuredIdx = -1;
  if (groups.length >= 3) {
    let max = 0;
    groups.forEach((g, i) => {
      if (g.pendingCount > 0 && g.totalDueCents > max) { max = g.totalDueCents; featuredIdx = i; }
    });
  }
  const ordered = featuredIdx >= 0 ? [groups[featuredIdx], ...groups.filter((_, i) => i !== featuredIdx)] : groups;

  return (
    <div className="stagger-children grid auto-rows-[minmax(210px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ordered.map((g, i) => {
        const featured = featuredIdx >= 0 && i === 0;
        const allPaid = g.pendingCount === 0 && g.completedCount > 0;
        const { total, pct } = progressOf(g);

        if (featured) {
          return (
            <div
              key={g.name}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(g)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g); } }}
              className={cn(
                "bento-featured animate-card-in group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-[32px] bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(2,6,23,0.3)] transition-transform duration-300 hover:-translate-y-1 sm:col-span-2 sm:p-7",
                ordered.length >= 5 && "lg:row-span-2",
              )}
            >
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-50 blur-3xl" style={{ background: "var(--brand)" }} />
              <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/80 ring-1 ring-white/15">
                    🔥 Mayor deuda
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-white/50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-extrabold text-white" style={{ background: avatarBg(g.name, false) }}>{initials(g.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold uppercase tracking-tight">{g.name}</p>
                    <p className="text-xs font-medium text-white/50">Actividad · {dateShort(g.lastActivity)}</p>
                  </div>
                </div>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Total due with fees</p>
                <p className="mt-1 text-[44px] font-black leading-none tracking-tight tabular-nums sm:text-6xl">{fmtUsd(g.totalDueCents)}</p>
              </div>

              <div className="relative mt-6 space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-xs font-semibold text-white/60">
                    <span>{g.completedCount} de {total} cobrados</span><span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand-gradient)" }} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenNotes(g); }}
                  className="block w-full rounded-2xl bg-white/[0.07] p-3.5 text-left ring-1 ring-white/10 transition hover:bg-white/[0.12]"
                >
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-white/80">{excerptOf(g.latestEntryText, 140) || "(sin contenido)"}</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-white/45">{g.latestEntryAgent} {g.latestEntryDate ? `· ${dateShort(g.latestEntryDate)}` : ""}</p>
                </button>
              </div>
            </div>
          );
        }

        return (
          <div
            key={g.name}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(g)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g); } }}
            className={cn(
              "bento-card animate-card-in group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] border p-5 transition-all duration-300",
              "border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(15,23,42,0.13)]",
              "dark:border-white/[0.07] dark:bg-[#0e131d]",
            )}
          >
            <span aria-hidden className={cn("pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl opacity-60", allPaid ? "bg-emerald-300/40" : "bg-red-300/40 dark:bg-red-500/20")} />
            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-extrabold text-white shadow-md" style={{ background: avatarBg(g.name, allPaid) }}>{initials(g.name)}</span>
                <button
                  type="button"
                  title="Agregar nota rápida"
                  onClick={(e) => { e.stopPropagation(); onQuickAdd(g); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 opacity-70 transition hover:bg-lime-100 hover:text-lime-700 group-hover:opacity-100 dark:bg-white/10 dark:text-slate-300"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
              <p className="mt-3 truncate text-[13.5px] font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{g.name}</p>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Actividad · {dateShort(g.lastActivity)}</p>
              <p className={cn("mt-3 text-[28px] font-black leading-none tracking-tight tabular-nums", allPaid ? "text-emerald-600 dark:text-emerald-300" : "text-slate-900 dark:text-white")}>{fmtUsd(g.totalDueCents)}</p>
            </div>

            <div className="relative mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
                <span className={cn(allPaid ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-300")}>
                  {allPaid ? "✓ Todo pagado" : `${g.pendingCount} pendiente${g.pendingCount === 1 ? "" : "s"}`}
                </span>
                <span className="tabular-nums text-slate-400">{g.completedCount}/{total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div className={cn("h-full rounded-full", allPaid ? "bg-emerald-500" : "bg-lime-500")} style={{ width: `${pct}%` }} />
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenNotes(g); }}
                className="mt-3 block w-full truncate rounded-xl bg-slate-50 px-3 py-2 text-left text-[12px] text-slate-500 transition hover:bg-slate-100 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]"
              >
                {excerptOf(g.latestEntryText, 60) || "(sin contenido)"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
