"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, FileSpreadsheet, RefreshCw, Search, TriangleAlert } from "lucide-react";
import {
  buildLogXlsx,
  fmtDate,
  fmtMoney,
  rowState,
  rowTotal,
  rowYear,
  STATE_LABEL,
  type LogRow,
  type LogSnapshot,
  type LogState,
} from "@/lib/checkLog";
import { noticeOrAlert } from "@/lib/exportNotice";
import { deliverOnDevice, isMobileExport } from "@/lib/nsfExport";

const HELPER = "http://127.0.0.1:47321";

type HelperStatus = {
  ok?: boolean;
  at?: string | null;
  locked?: boolean;
  pending?: number;
  adoptable?: number;
  written?: number;
  errors?: string[];
  rowsInExcel?: number;
  running?: boolean;
};

const STATE_STYLE: Record<LogState, string> = {
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  partial: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
  open: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800",
  loss: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800",
};

function Badge({ s }: { s: LogState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${STATE_STYLE[s]}`}>
      {STATE_LABEL[s]}
    </span>
  );
}

function ago(iso?: string | null) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString("es");
}

export default function LogView({ snapshot, loadError }: { snapshot: LogSnapshot | null; loadError: string | null }) {
  const router = useRouter();
  const rows = useMemo(() => (snapshot?.rows ?? []).filter((r) => r.H || r.F), [snapshot]);

  const [q, setQ] = useState("");
  const [state, setState] = useState<"all" | LogState>("all");
  const [year, setYear] = useState<number | "all">("all");
  const [helper, setHelper] = useState<HelperStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const years = useMemo(() => Array.from(new Set(rows.map(rowYear).filter(Boolean))).sort((a, b) => b - a), [rows]);

  const loadHelper = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`${HELPER}/log/status`, { signal: ctrl.signal });
      window.clearTimeout(t);
      setHelper(r.ok ? ((await r.json()) as HelperStatus) : null);
    } catch {
      setHelper(null);
    }
  }, []);

  useEffect(() => {
    void loadHelper();
    const id = window.setInterval(loadHelper, 20000);
    return () => window.clearInterval(id);
  }, [loadHelper]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (state === "all" ? true : rowState(r) === state))
      .filter((r) => (year === "all" ? true : rowYear(r) === year))
      .filter((r) => {
        if (!needle) return true;
        return [r.H, r.E, r.F, r.I, r.T, r.U].some((v) => String(v ?? "").toLowerCase().includes(needle));
      })
      .sort((a, b) => (b.D || "").localeCompare(a.D || "") || b.r - a.r);
  }, [rows, q, state, year]);

  const kpi = useMemo(() => {
    const k = { total: rows.length, open: 0, partial: 0, done: 0, loss: 0, pendingAmt: 0, fees: 0 };
    for (const r of rows) {
      const s = rowState(r);
      k[s] += 1;
      if (s === "open" || s === "partial") k.pendingAmt += rowTotal(r);
      k.fees += Number(r.N) || 0;
    }
    return k;
  }, [rows]);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch(`${HELPER}/log/sync?all=0`, { method: "POST" });
      if (r.ok) setHelper((await r.json()) as HelperStatus);
      router.refresh();
    } catch {
      setHelper(null);
    } finally {
      setSyncing(false);
    }
  }

  async function exportXlsx() {
    if (exporting) return;
    setExporting(true);
    const notice = await noticeOrAlert();
    try {
      notice.start("Exportando registro", "Preparando el Excel con los datos actuales…");
      const blob = await buildLogXlsx(rows);
      const d = new Date();
      const name = `RETURNED CHECK LOG ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.xlsx`;

      let helperOk = false;
      if (!isMobileExport()) {
        try {
          const ctrl = new AbortController();
          const t = window.setTimeout(() => ctrl.abort(), 1500);
          helperOk = (await fetch(`${HELPER}/ping`, { signal: ctrl.signal })).ok;
          window.clearTimeout(t);
        } catch {
          helperOk = false;
        }
      }

      if (helperOk) {
        notice.update("Guardando en OneDrive", "NSF CK LOGS");
        const r = await fetch(`${HELPER}/save?dir=logs&name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; file?: string; size?: number; error?: string } | null;
        if (!r.ok || !j?.ok) throw new Error(`OneDrive no recibió el archivo${j?.error ? `: ${j.error}` : ""}.`);
        if (j.size !== blob.size) throw new Error("El archivo se guardó incompleto. Vuelve a exportar.");
        notice.success("Registro exportado", j.file || name);
      } else {
        const res = await deliverOnDevice([{ filename: name, blob }]);
        if (res === "cancelled") notice.close();
        else notice.success(res === "shared" ? "Registro compartido" : "Registro descargado", name);
      }
    } catch (e) {
      notice.error("No se exportó el registro", e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setExporting(false);
    }
  }

  const stale = snapshot ? Date.now() - new Date(snapshot.at).getTime() > 15 * 60 * 1000 : false;

  const kpis: { label: string; value: string; tone: string; key?: LogState }[] = [
    { label: "Total cheques", value: String(kpi.total), tone: "text-zinc-900 dark:text-zinc-50" },
    { label: "Pendientes", value: String(kpi.open + kpi.partial), tone: "text-sky-600 dark:text-sky-400", key: "open" },
    { label: "Completados", value: String(kpi.done), tone: "text-emerald-600 dark:text-emerald-400", key: "done" },
    { label: "Por cobrar", value: fmtMoney(kpi.pendingAmt), tone: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> Return Checks
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Registro de cheques devueltos</h1>
          <p className="text-xs text-zinc-500">Igual que tu Excel RETURNED CHECK LOG, siempre al día con tus reportes.</p>
        </div>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={exporting || !rows.length}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>

      {/* Estado de la sincronización con el Excel */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {helper ? (
          helper.locked || (helper.pending ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
              <TriangleAlert className="h-4 w-4" />
              Excel abierto en la computadora: {helper.pending ?? 0} reporte(s) esperan. Se agregan solos al cerrarlo.
            </span>
          ) : helper.errors && helper.errors.length ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300">
              <TriangleAlert className="h-4 w-4" /> {helper.errors[0]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Excel sincronizado ({ago(helper.at)})
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <Clock className="h-4 w-4" />
            {snapshot
              ? `Datos del Excel ${ago(snapshot.at)}${stale ? " — la computadora no ha reportado hace rato" : ""}`
              : "Esperando la primera copia desde la computadora"}
            {snapshot?.status?.locked || (snapshot?.status?.pending ?? 0) > 0 ? ` · ${snapshot?.status?.pending ?? 0} reporte(s) por agregar` : ""}
          </span>
        )}
        {helper ? (
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sincronizar ahora
          </button>
        ) : null}
        {helper && (helper.adoptable ?? 0) > 0 ? (
          <span className="w-full text-[11px] text-zinc-500">
            Hay {helper.adoptable} reporte(s) anteriores que no están en el Excel; no se agregan solos para no duplicar.
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>
      ) : !snapshot ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          Todavía no hay datos. Cuando el ayudante de la computadora esté activo (INSTALAR.bat) subirá aquí el registro.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => k.key && setState(state === k.key ? "all" : k.key)}
                className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition dark:bg-zinc-900 ${
                  k.key && state === k.key ? "border-emerald-400 ring-2 ring-emerald-200" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{k.label}</div>
                <div className={`mt-1 text-2xl font-extrabold tabular-nums ${k.tone}`}>{k.value}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar compañía, # cheque, agente…"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <select
              value={state}
              onChange={(e) => setState(e.target.value as "all" | LogState)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">Todos los estados</option>
              {(Object.keys(STATE_LABEL) as LogState[]).map((s) => (
                <option key={s} value={s}>{STATE_LABEL[s]}</option>
              ))}
            </select>
            <select
              value={String(year)}
              onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">Todos los años</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">{list.length} de {rows.length}</span>
          </div>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">
                  <tr>
                    {["Devuelto", "Compañía / emisor", "# Cheque", "Motivo", "Monto", "Comisión", "Total", "Pago comisión", "Pago cheque", "Agente", "Estado"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2.5 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Row key={r.r} r={r} />
                  ))}
                </tbody>
              </table>
              {!list.length ? <div className="p-8 text-center text-sm text-zinc-500">Sin resultados.</div> : null}
            </div>
          </div>

          {/* Celular: tarjetas */}
          <div className="space-y-2 md:hidden">
            {list.map((r) => (
              <Card key={r.r} r={r} />
            ))}
            {!list.length ? <div className="p-8 text-center text-sm text-zinc-500">Sin resultados.</div> : null}
          </div>
        </>
      )}
    </div>
  );
}

function pay(date?: string | null, method?: string | null) {
  if (!date && !method) return "—";
  return `${fmtDate(date)}${method ? ` · ${method}` : ""}`;
}

function Row({ r }: { r: LogRow }) {
  return (
    <tr className="border-t border-zinc-100 hover:bg-emerald-50/40 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtDate(r.D)}</td>
      <td className="max-w-[260px] px-3 py-2">
        <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{r.H || "—"}</div>
        <div className="truncate text-[11px] text-zinc-500">{r.E}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.F ?? ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-300">{r.I}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtMoney(r.M)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtMoney(r.N)}</td>
      <td className="whitespace-nowrap px-3 py-2 font-bold tabular-nums">{fmtMoney(rowTotal(r))}</td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-300">{pay(r.P, r.Q)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-300">{pay(r.R, r.S)}</td>
      <td className="whitespace-nowrap px-3 py-2">{r.T}</td>
      <td className="px-3 py-2"><Badge s={rowState(r)} /></td>
    </tr>
  );
}

function Card({ r }: { r: LogRow }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{r.H || "—"}</div>
          <div className="truncate text-[11px] text-zinc-500">{r.E} · Cheque #{r.F ?? ""}</div>
        </div>
        <Badge s={rowState(r)} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div><div className="text-zinc-500">Monto</div><div className="font-semibold tabular-nums">{fmtMoney(r.M)}</div></div>
        <div><div className="text-zinc-500">Comisión</div><div className="font-semibold tabular-nums">{fmtMoney(r.N)}</div></div>
        <div><div className="text-zinc-500">Total</div><div className="font-bold tabular-nums">{fmtMoney(rowTotal(r))}</div></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>Devuelto {fmtDate(r.D)}</span>
        {r.I ? <span>{r.I}</span> : null}
        {r.T ? <span>Agente {r.T}</span> : null}
        {r.P || r.Q ? <span>Comisión: {pay(r.P, r.Q)}</span> : null}
        {r.R || r.S ? <span>Cheque: {pay(r.R, r.S)}</span> : null}
      </div>
    </div>
  );
}
