"use client";
import { onCoverError } from "@/lib/coverRetry";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Archive,
  BookOpen,
  BookmarkPlus,
  Eye,
  LayoutGrid,
  PanelRight,
  PanelTop,
  Rows3,
  StickyNote,
  Type,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Paperclip,
  Palette,
  Plus,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import "./dashboard.css";
import { BG_NAMES, HDR_NAMES, PAL_LIST, setDashPrefs, useDashPrefs, type DashPrefs } from "./dashPrefs";

type Bucket = "pending" | "completed" | "trash";

export type DashSheet = { id: string; no: string; amount: string; date: string; paid: boolean; agent: string; cover: string | null };
export type DashEntry = { text: string; date: string; agent: string };
export type DashCompany = {
  name: string;
  init: string;
  totalDueCents: number;
  due: string;
  pendingCount: number;
  completedCount: number;
  checkCount: number;
  lastDate: string;
  entryDate: string;
  entryAgent: string;
  entryText: string;
  sheets: DashSheet[];
  recent: DashEntry[];
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ───────── Panel para personalizar (diseño, notas, encabezado, fondo, color) ───────── */
export function DashSettingsPanel({ prefs, onClose }: { prefs: DashPrefs; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = window.setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const accent = "var(--dash-bar, #0a84ff)";
  const accentFg = "var(--dash-bar-fg, #fff)";

  /** Tarjeta grande con icono y descripción corta. */
  const Tile = ({ on, onClick, icon, title, hint }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`group relative flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition active:scale-[.98] ${
        on ? "border-transparent shadow-md" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800"
      }`}
      style={on ? { background: accent, color: accentFg } : undefined}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-xl ${on ? "bg-white/25" : "bg-white text-zinc-700 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"}`}>{icon}</span>
      <span className="text-[13px] font-extrabold leading-tight">{title}</span>
      <span className={`text-[11px] font-medium leading-snug ${on ? "opacity-85" : "text-zinc-500 dark:text-zinc-400"}`}>{hint}</span>
      {on ? <Check className="absolute right-2.5 top-2.5 h-4 w-4" strokeWidth={3} /> : null}
    </button>
  );
  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-xl px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${on ? "shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}
      style={on ? { background: accent, color: accentFg } : undefined}
    >
      {children}
    </button>
  );
  const Sec = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <section className="border-t border-zinc-100 px-4 py-3.5 first:border-t-0 dark:border-zinc-800">
      <div className="mb-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.14em] text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );

  return (
    <div
      ref={ref}
      className="fixed right-3 top-16 z-[90] flex max-h-[82dvh] w-[min(94vw,400px)] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl shadow-sm" style={{ background: accent, color: accentFg }}>
            <Palette className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="text-[15px] font-black leading-tight">Estilo del panel</div>
            <div className="text-[11px] font-medium text-zinc-500">Se guarda solo en este equipo</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 transition hover:bg-zinc-200 dark:bg-zinc-800" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Sec icon={<LayoutGrid className="h-3 w-3" />} title="Diseño">
          <div className="grid grid-cols-3 gap-2">
            <Tile on={prefs.design === 8} onClick={() => setDashPrefs({ design: 8 })} icon={<StickyNote className="h-4 w-4" />} title="Nota adhesiva" hint="Carpeta con post-it" />
            <Tile on={prefs.design === 6} onClick={() => setDashPrefs({ design: 6 })} icon={<BookOpen className="h-4 w-4" />} title="Libreta" hint="Carpeta con cuaderno" />
            <Tile on={prefs.design === 0} onClick={() => setDashPrefs({ design: 0 })} icon={<Rows3 className="h-4 w-4" />} title="Clásico" hint="Lista simple" />
          </div>
        </Sec>

        {prefs.design !== 0 ? (
          <>
            <Sec icon={<StickyNote className="h-3 w-3" />} title="Cómo se ven las notas">
              <div className="grid grid-cols-3 gap-2">
                <Tile on={prefs.notes === "big"} onClick={() => setDashPrefs({ notes: "big" })} icon={<PanelRight className="h-4 w-4" />} title="Grande" hint="Siempre visible al lado" />
                <Tile on={prefs.notes === "tab"} onClick={() => setDashPrefs({ notes: "tab" })} icon={<BookmarkPlus className="h-4 w-4" />} title="Pestaña" hint="Escondida, sale a la derecha" />
                <Tile on={prefs.notes === "peek"} onClick={() => setDashPrefs({ notes: "peek" })} icon={<Eye className="h-4 w-4" />} title="Asomando" hint="Se ve la última nota" />
              </div>
            </Sec>

            <Sec icon={<PanelTop className="h-3 w-3" />} title="Encabezado">
              <div className="grid grid-cols-2 gap-1.5">
                {HDR_NAMES.map((n, i) => (
                  <Chip key={n} on={prefs.hdr === i + 1} onClick={() => setDashPrefs({ hdr: i + 1 })}>{n}</Chip>
                ))}
              </div>
            </Sec>

            <Sec icon={<Type className="h-3 w-3" />} title="Texto de fondo">
              <div className="grid grid-cols-2 gap-1.5">
                {BG_NAMES.map((n, i) => (
                  <Chip key={n} on={prefs.bg === i} onClick={() => setDashPrefs({ bg: i })}>{n}</Chip>
                ))}
              </div>
            </Sec>

            <Sec icon={<Palette className="h-3 w-3" />} title="Color">
              {[
                { label: "Modernas", list: PAL_LIST.filter((p) => p.grad) },
                { label: "Clásicas", list: PAL_LIST.filter((p) => !p.grad) },
              ].map((g) => (
              <div key={g.label} className="mb-3 last:mb-0">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">{g.label}</p>
              <div className="grid grid-cols-5 gap-2.5">
                {g.list.map((p) => {
                  const on = prefs.pal === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.name}
                      aria-label={p.name}
                      aria-pressed={on}
                      onClick={() => setDashPrefs({ pal: p.id })}
                      className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition active:scale-95 dark:ring-offset-zinc-900 ${on ? "ring-zinc-400" : "ring-transparent hover:ring-zinc-200"}`}
                      style={{ background: p.grad ?? p.sw }}
                    >
                      {on ? <Check className="h-4 w-4" strokeWidth={3.5} style={{ color: p.id === "yellow" ? "#111" : "#fff" }} /> : null}
                    </button>
                  );
                })}
              </div>
              </div>
              ))}
            </Sec>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Botón para abrir el panel cuando se usa el diseño clásico. */
export function DashSettingsButton() {
  const prefs = useDashPrefs();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <Palette className="h-3.5 w-3.5" /> Estilo del panel
        </button>
      </div>
      {open ? <DashSettingsPanel prefs={prefs} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/* ───────── Texto de fondo del encabezado ───────── */
function BgText({ v, names, amounts, top }: { v: number; names: string[]; amounts: string[]; top: string }) {
  if (v === 0) return null;
  const rep = (a: string[], n = 2) => Array.from({ length: n }, () => a).flat();
  if (v === 1)
    return (
      <div className="kt kt1" aria-hidden>
        <div>{rep(names).map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>
    );
  if (v === 2)
    return (
      <div className="kt kt2" aria-hidden>
        <div className="a">{rep(names).map((t, i) => <span key={i}>{t}</span>)}</div>
        <div className="b">{rep(names).map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>
    );
  if (v === 3)
    return (
      <div className="kt kt3" aria-hidden>
        <span>{top}</span>
      </div>
    );
  if (v === 4)
    return (
      <div className="kt kt4" aria-hidden>
        {[0, 1, 2].map((r) => (
          <div key={r} className={r % 2 ? "b" : "a"}>{rep(amounts, 4).map((t, i) => <span key={i}>{t}</span>)}</div>
        ))}
      </div>
    );
  return (
    <div className="kt kt5" aria-hidden>
      <div>{rep(names).map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

/* ───────── Encabezado (H1–H7) ───────── */
function Head({
  prefs,
  title,
  eyebrow,
  companies,
  onSettings,
}: {
  prefs: DashPrefs;
  title: string;
  eyebrow: string;
  companies: DashCompany[];
  onSettings: () => void;
}) {
  const h = prefs.hdr;
  const totalCents = companies.reduce((s, c) => s + c.totalDueCents, 0);
  const total = useCountUp(totalCents / 100);
  const pend = companies.reduce((s, c) => s + c.pendingCount, 0);
  const paid = companies.reduce((s, c) => s + c.completedCount, 0);
  const names = companies.map((c) => c.name.toUpperCase());
  const items = companies.map((c) => `${c.name.toUpperCase()}  ${c.due}`);
  const amounts = companies.filter((c) => c.totalDueCents > 0).map((c) => c.due);
  const topCo = [...companies].sort((a, b) => b.totalDueCents - a.totalDueCents)[0];
  const topWord = (topCo?.name ?? "Return Checks").split(" ").slice(0, 2).join(" ");
  const kpis = [
    { Ico: Wallet, l: "Total adeudado", v: usd(total), s: "con fees incluidos" },
    { Ico: FileText, l: "Cheques pendientes", v: String(pend), s: "por cobrar" },
    { Ico: Building2, l: "Compañías", v: String(companies.length), s: `${paid} pagado(s)` },
  ];
  const words = title.split(" ").map((w, i) => (
    <span key={i} className="kh-word" style={{ animationDelay: `${i * 90}ms` }}>{w}&nbsp;</span>
  ));
  const icons = null;
  const kpiEls = kpis.map((k, i) => (
    <div key={k.l} className="kh-kpi" style={{ animationDelay: `${i * 80}ms` }}>
      <div className="kh-kpi-top"><span className="kh-kpi-ico"><k.Ico className="h-4 w-4" /></span><small>{k.l}</small></div>
      <b>{k.v}</b>
      <span>{k.s}</span>
    </div>
  ));
  const ticker = (
    <div className="kh-ticker">
      <div>
        {[...items, ...items].map((t, i) => (
          <span key={i}><i />{t}</span>
        ))}
      </div>
    </div>
  );
  const chips = (
    <div className="kh-chips">
      <span>{companies.length} compañías</span>
      <span>{pend} cheques pendientes</span>
    </div>
  );
  const bgText = <BgText v={prefs.bg} names={names} amounts={amounts} top={topWord} />;
  void onSettings;

  if (h === 3) {
    return (
      <header className="kh kh-h3">
        {bgText}
        <div className="kh-in">
          <div className="kh-bento">
            <div className="kh-b-title">
              <div className="flex items-center justify-between">
                <div className="kh-eyebrow">{eyebrow}</div>
                {icons}
              </div>
              <h1 className="kh-title">{words}</h1>
              {chips}
            </div>
            {kpiEls}
          </div>
          {ticker}
        </div>
      </header>
    );
  }
  if (h === 4) {
    return (
      <header className="kh kh-h4">
        {bgText}
        <div className="kh-in">
          <div className="kh-compact">
            <div className="min-w-0">
              <div className="kh-eyebrow">{eyebrow}</div>
              <h1 className="kh-title">{words}</h1>
            </div>
            <div className="kh-stats">
              {kpis.map((k) => (
                <div key={k.l}><small>{k.l}</small><b>{k.v}</b></div>
              ))}
            </div>
            {icons}
          </div>
          {ticker}
        </div>
      </header>
    );
  }
  if (h === 5) {
    return (
      <header className="kh kh-h5">
        {bgText}
        <div className="kh-in">
          <div className="kh-top">
            <div className="kh-eyebrow">{eyebrow}</div>
            {icons}
          </div>
          <div className="kh-row">
            <h1 className="kh-title">{words}</h1>
            <div className="kh-total5"><small>Total adeudado</small><b>{usd(total)}</b></div>
          </div>
          <div className="kh-kpis">{kpiEls.slice(1)}</div>
        </div>
      </header>
    );
  }
  if (h === 6) {
    const max = Math.max(1, ...companies.map((c) => c.totalDueCents));
    return (
      <header className="kh kh-h6">
        {bgText}
        <div className="kh-in">
          <div className="kh-top">
            <div className="kh-eyebrow">{eyebrow}</div>
            {icons}
          </div>
          <div className="kh-split">
            <div className="kh-split-l">
              <h1 className="kh-title">{words}</h1>
              <div className="kh-mini">
                <div><small>Cheques pendientes</small><b>{pend}</b></div>
                <div><small>Compañías</small><b>{companies.length}</b></div>
                <div><small>Pagados</small><b>{paid}</b></div>
              </div>
            </div>
            <div className="kh-split-r">
              <small>Total adeudado</small>
              <b>{usd(total)}</b>
              <div className="kh-bars" aria-hidden>
                {companies.slice(0, 12).map((c, i) => (
                  <i key={c.name} style={{ height: `${Math.max(10, (c.totalDueCents / max) * 100)}%`, animationDelay: `${i * 90}ms` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="kh-strip"><div>{[...items, ...items].map((t, i) => <span key={i}>{t}<em>✦</em></span>)}</div></div>
        </div>
      </header>
    );
  }
  if (h === 7) {
    return (
      <header className="kh kh-h7">
        {bgText}
        <div className="kh-in">
          <div className="kh-top">
            <div className="kh-eyebrow">{eyebrow}</div>
            {icons}
          </div>
          <div className="kh-h7-title">{words}</div>
          <div className="kh-huge">{usd(total)}</div>
          <div className="kh-h7-stats">
            <div><b>{pend}</b><span>Cheques pendientes</span></div>
            <div><b>{companies.length}</b><span>Compañías</span></div>
            <div><b>{paid}</b><span>Pagados</span></div>
          </div>
        </div>
      </header>
    );
  }
  /* h = 1 (bloque de color) o 2 (título grande) */
  return (
    <header className={`kh kh-h${h === 2 ? 2 : 1}`}>
      {bgText}
      <div className="kh-in">
        <div className="kh-top">
          <div className="kh-eyebrow">{eyebrow}</div>
          {icons}
        </div>
        <div className="kh-row">
          <h1 className="kh-title">{words}</h1>
          <div className="kh-total">
            <small>Total adeudado</small>
            <b>{usd(total)}</b>
            {chips}
          </div>
        </div>
        <div className="kh-kpis">{kpiEls}</div>
        {ticker}
      </div>
    </header>
  );
}

/* ───────── Notas escondidas dentro de la carpeta: pestaña lateral / asomando ───────── */
function SideNote({
  c,
  mode,
  onOpenNotes,
  onQuickAdd,
}: {
  c: DashCompany;
  mode: "tab" | "peek";
  onOpenNotes: () => void;
  onQuickAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = c.recent;
  const n = list.length;
  const idx = Math.min(k, Math.max(0, n - 1));
  const cur = n ? list[idx] : null;

  const close = () => {
    setOpen(false);
    setK(0);
  };

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={ref}
      className={`sn sn-${mode} ${open ? "on" : ""}`}
      data-tour="notes"
      role="button"
      tabIndex={0}
      aria-label="Notas"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        if (!open) setOpen(true);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (!open && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <span className="sn-coil" aria-hidden />
      {!open ? (
        mode === "tab" ? (
          <span className="sn-strip">
            <b>{n}</b>
            <em>Notas</em>
          </span>
        ) : (
          <span className="sn-pk">
            <b className="sn-badge">{n}</b>
            <span className="sn-date">{cur ? `${cur.date}${cur.agent ? ` · ${cur.agent}` : ""}` : "Sin notas"}</span>
            <span className="sn-last">{cur?.text || "Toca para agregar la primera nota"}</span>
          </span>
        )
      ) : (
        <span className="sn-full" onClick={stop}>
          <span className="sn-head">
            <span>{cur ? `${cur.date}${cur.agent ? ` · ${cur.agent}` : ""}` : "Notas"}</span>
            <span className="inline-flex items-center gap-1.5">
              <button type="button" className="sn-ib" title="Agregar nota rápida" aria-label="Agregar nota rápida" onClick={(e) => { stop(e); close(); onQuickAdd(); }}>
                <Plus className="h-3 w-3" strokeWidth={3} />
              </button>
              <button type="button" className="sn-ib" title="Cerrar" aria-label="Cerrar" onClick={(e) => { stop(e); close(); }}>
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </span>
          </span>
          <span className="sn-text">{cur?.text || <em>(sin notas todavía)</em>}</span>
          <span className="sn-foot">
            <span className="sn-pager">
              <button type="button" aria-label="Anterior" disabled={idx <= 0} onClick={(e) => { stop(e); setK(idx - 1); }}>‹</button>
              <i>{n ? `${idx + 1}/${n}` : "0/0"}</i>
              <button type="button" aria-label="Siguiente" disabled={idx >= n - 1} onClick={(e) => { stop(e); setK(idx + 1); }}>›</button>
            </span>
            <button type="button" className="sn-all" onClick={(e) => { stop(e); close(); onOpenNotes(); }}>Ver todas</button>
          </span>
        </span>
      )}
    </div>
  );
}

/* ───────── Tarjeta: carpeta con reportes + nota ───────── */
function Card({
  c,
  i,
  onOpen,
  onOpenNotes,
  onQuickAdd,
  notesMode,
}: {
  c: DashCompany;
  i: number;
  notesMode: "big" | "tab" | "peek";
  onOpen: () => void;
  onOpenNotes: () => void;
  onQuickAdd: () => void;
}) {
  const allPaid = c.pendingCount === 0 && c.checkCount > 0;
  const sheets = c.sheets.slice(0, 3);
  const off = 3 - sheets.length;
  const entries = c.recent.length ? c.recent : [{ text: "", date: "", agent: "" }];
  return (
    <article className={`kc ${notesMode !== "big" ? `nt-${notesMode}` : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 70}ms` }}>
      <div
        className="kf"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <div className="kf-back" />
        {notesMode !== "big" ? <SideNote c={c} mode={notesMode} onOpenNotes={onOpenNotes} onQuickAdd={onQuickAdd} /> : null}
        {sheets.map((s, k) => (
          <div key={s.id} className={`kf-sheet ${s.cover ? "has-img" : ""}`} style={{ ["--o" as string]: k + off } as CSSProperties}>
            {s.cover ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ks-photo" src={s.cover} alt="" loading="lazy" decoding="async" onError={onCoverError} />
                <span className={`ks-tag ks-float ${s.paid ? "ok" : "pend"}`}>{s.paid ? "Pagado" : "Pendiente"}</span>
              </>
            ) : (
              <>
                <div className="ks-head">
                  <span>Check #{s.no}</span>
                  <span className={`ks-tag ${s.paid ? "ok" : "pend"}`}>{s.paid ? "Pagado" : "Pendiente"}</span>
                </div>
                <div className="ks-amt">{s.amount}</div>
                <div className="ks-meta">
                  <span>{s.date}</span>
                  <span>{s.agent ? `Agente · ${s.agent}` : ""}</span>
                </div>
                <div className="ks-scan">
                  <i /><i />
                  <svg viewBox="0 0 80 22" aria-hidden><path d="M2 16c8-14 12 4 18-6s8 8 14-2 8 6 14-1 8 4 14-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </div>
              </>
            )}
          </div>
        ))}
        <div className="kf-front">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="kf-av">{c.init || "?"}</span>
              <div className="min-w-0">
                <div className="kf-name">{c.name}</div>
                <div className="kf-sub">{c.entryAgent ? `${c.entryAgent} · ` : ""}Actividad {c.lastDate}</div>
              </div>
            </div>
            <MoreHorizontal className="h-5 w-5 shrink-0 opacity-60" />
          </div>
          <div className="kf-bottom">
            <div>
              <div className="kf-lbl">Total due with fees</div>
              <div className="kf-due">{c.due}</div>
            </div>
            <span className={`kf-chip ${allPaid ? "ok" : ""}`}>{allPaid ? "✓ Pagado" : `${c.pendingCount} pending`}</span>
          </div>
        </div>
      </div>
      {notesMode === "big" ? (
      <aside
        className="kn"
        data-tour="notes"
        role="button"
        tabIndex={0}
        onClick={onOpenNotes}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenNotes();
          }
        }}
        style={{ cursor: "pointer" }}
        title="Ver todas las notas"
      >
        <div className="kn-head">
          <span>{c.entryDate || "—"}</span>
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              className="kn-plus"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd();
              }}
              title="Agregar nota rápida"
              aria-label="Agregar nota rápida"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
            <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> {c.checkCount}</span>
          </span>
        </div>
        <div className="kn-agent">Última nota{c.entryAgent ? ` · ${c.entryAgent}` : ""}</div>
        <ul className="kn-list">
          {entries.map((e, k) => {
            const done = allPaid || k > 0;
            return (
              <li key={k} className={done ? "done" : ""}>
                <span className="kn-box">{done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>
                <span>{e.text || <em>(sin contenido)</em>}</span>
              </li>
            );
          })}
        </ul>
        <div className="kn-foot">
          <div><small>Checks</small><b>{c.checkCount}</b></div>
          <div className="p"><small>Pend</small><b>{c.pendingCount}</b></div>
          <div className="g"><small>Paid</small><b>{c.completedCount}</b></div>
        </div>
      </aside>
      ) : null}
    </article>
  );
}

/* ───────── Barra inferior con notch ───────── */
function NotchDock({
  bucket,
  counts,
  onBucket,
  onNew,
  onContacts,
}: {
  bucket: Bucket;
  counts: Record<Bucket, number>;
  onBucket: (b: Bucket) => void;
  onNew: () => void;
  onContacts: () => void;
}) {
  const Btn = ({ b, label, Icon }: { b: Bucket; label: string; Icon: typeof Archive }) => {
    const on = bucket === b;
    const n = b === "trash" ? 0 : counts[b];
    return (
      <button type="button" onClick={() => onBucket(b)} className={`kn-b ${on ? "on" : ""}`}>
        <span className="relative">
          <Icon className="h-5 w-5" />
          {n > 0 ? <em className="kn-badge">{n}</em> : null}
        </span>
        {label}
        {on ? <i className="kn-dot" /> : null}
      </button>
    );
  };
  return (
    <div className="kn-dock">
      <div className="kn-wrap">
        <button type="button" className="kn-fab" title="Nueva compañía" aria-label="Nueva compañía" onClick={onNew}>
          <Plus className="h-6 w-6" />
        </button>
        <div className="kn-bar">
          <Btn b="pending" label="Pendientes" Icon={Archive} />
          <Btn b="completed" label="Completados" Icon={CheckCircle2} />
          <div className="w-16 shrink-0" />
          <Btn b="trash" label="Papelera" Icon={Trash2} />
          <button type="button" onClick={onContacts} className="kn-b">
            <span className="relative"><Users className="h-5 w-5" /></span>
            Contactos
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Dashboard completo ───────── */
export default function DashboardV2({
  companies,
  bucket,
  counts,
  onBucket,
  onOpenCompany,
  onOpenNotes,
  onQuickAdd,
  onNew,
  onContacts,
}: {
  companies: DashCompany[];
  bucket: Bucket;
  counts: Record<Bucket, number>;
  onBucket: (b: Bucket) => void;
  onOpenCompany: (name: string) => void;
  onOpenNotes: (name: string) => void;
  onQuickAdd: (name: string) => void;
  onNew: () => void;
  onContacts: () => void;
}) {
  const prefs = useDashPrefs();
  const design = prefs.design === 6 ? 6 : 8;

  // Render progresivo: se dibujan 12 tarjetas y el resto al acercarse al final (menos DOM = menos lag).
  const PAGE = 12;
  const [shown, setShown] = useState(PAGE);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setShown(PAGE); }, [bucket]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, companies.length]);

  // Integra el encabezado de la app con el panel: color de página, alto y color de texto.
  useEffect(() => {
    const pal = PAL_LIST.find((p) => p.id === prefs.pal) ?? PAL_LIST[0];
    const root = document.documentElement;
    root.classList.add("dash-on", "dash-home");
    root.classList.toggle("dash-night", prefs.pal === "night");
    root.classList.toggle("dash-grad", !!pal.grad);
    root.style.setProperty("--dash-page", pal.page);
    const header = document.querySelector<HTMLElement>("header.sticky");
    const measure = () => {
      if (header) root.style.setProperty("--dash-hdr-h", `${header.offsetHeight}px`);
    };
    const stick = () => {
      const kh = document.querySelector<HTMLElement>(".pal .kh");
      if (!kh) return;
      const part = kh.querySelector<HTMLElement>(".kh-b-title, .kh-compact, .kh-row, .kh-split-l, .kh-h7-title");
      const khR = kh.getBoundingClientRect();
      const compact = part ? part.getBoundingClientRect().bottom - khR.top + 14 : khR.height;
      root.style.setProperty("--dash-kh-top", "0px");
      root.style.setProperty("--dash-compact", `${Math.min(khR.height, compact).toFixed(0)}px`);
    };
    const colors = () => {
      const kh = document.querySelector<HTMLElement>(".pal .kh");
      const kr = document.querySelector<HTMLElement>(".pal .kroot");
      if (kh) {
        root.style.setProperty("--dash-hfg", getComputedStyle(kh).color);
        let bgc = getComputedStyle(kh).backgroundColor;
        if (!bgc || bgc === "rgba(0, 0, 0, 0)" || bgc === "transparent") bgc = kr ? getComputedStyle(kr).backgroundColor : "#fff";
        root.style.setProperty("--dash-hbg", bgc);
      }
      if (kr) root.style.setProperty("--dash-ink", getComputedStyle(kr).color);
    };
    let scrollRaf = 0;
    let lastP = -1;
    let khEl: HTMLElement | null = null;
    const apply = () => {
      scrollRaf = 0;
      const y = window.scrollY;
      root.classList.toggle("dash-scrolled", y > 24);
      const p = Math.round(Math.min(1, Math.max(0, y / 150)) * 100) / 100;
      if (p === lastP) return;
      lastP = p;
      if (!khEl || !khEl.isConnected) khEl = document.querySelector<HTMLElement>(".pal .kh");
      khEl?.style.setProperty("--dash-p", String(p));
    };
    const onScroll = () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(apply); };
    measure();
    const raf = requestAnimationFrame(colors);
    const t = window.setTimeout(() => { colors(); stick(); }, 160);
    const khObs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => stick()) : null;
    const khNode = document.querySelector<HTMLElement>(".pal .kh");
    if (khNode) khObs?.observe(khNode);
    window.addEventListener("resize", stick);
    onScroll();
    const ro = header ? new ResizeObserver(measure) : null;
    if (header) ro?.observe(header);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      khObs?.disconnect();
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("resize", stick);
      ro?.disconnect();
      window.removeEventListener("scroll", onScroll);
      root.classList.remove("dash-home", "dash-scrolled");
      root.style.removeProperty("--dash-kh-top");
      document.querySelector<HTMLElement>(".pal .kh")?.style.removeProperty("--dash-p");
      const bar = root.style.getPropertyValue("--dash-bar");
      const fg = root.style.getPropertyValue("--dash-bar-fg");
      if (bar) root.style.setProperty("--dash-hbg", bar);
      if (fg) root.style.setProperty("--dash-hfg", fg);
    };
  }, [prefs.pal, prefs.hdr, prefs.design]);

  const title = bucket === "completed" ? "Completados" : bucket === "trash" ? "Papelera" : design === 6 ? "Mis expedientes" : "Mis compañías";
  const eyebrow = `Return Checks · ${design === 6 ? "Archivo" : "Cobranza"}`;

  return (
    <div className={`pal pal-${prefs.pal}`}>
      <div className={`kroot v${design}`}>
        <Head prefs={prefs} title={title} eyebrow={eyebrow} companies={companies} onSettings={() => {}} />
        <div className={`kg ${prefs.notes !== "big" ? "kg-hide" : ""}`}>
          {companies.length ? (
            companies.slice(0, shown).map((c, i) => (
              <Card
                key={c.name}
                c={c}
                i={i}
                onOpen={() => onOpenCompany(c.name)}
                onOpenNotes={() => onOpenNotes(c.name)}
                onQuickAdd={() => onQuickAdd(c.name)}
                notesMode={prefs.notes}
              />
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-sm font-semibold opacity-50">
              {bucket === "trash" ? "La papelera está vacía." : "No hay compañías en esta sección."}
            </div>
          )}
        </div>
        {companies.length > shown ? <div ref={moreRef} aria-hidden style={{ height: 1 }} /> : null}
        <NotchDock bucket={bucket} counts={counts} onBucket={onBucket} onNew={onNew} onContacts={onContacts} />
      </div>
    </div>
  );
}
