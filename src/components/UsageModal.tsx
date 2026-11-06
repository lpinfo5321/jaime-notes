"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";

type UsageResponse = {
  ok: boolean;
  latencyMs: number;
  limits: {
    dbBytes: number;
    storageBytes: number;
    fileMaxBytes: number;
    egressBytesMonth: number;
    monthlyActiveUsers: number;
    realtimeConnections: number;
  };
  usage: { dbBytes: number; storageBytes: number; attachmentsBytes: number; documentsBytes: number; largestFileBytes: number };
  counts: { reports: number; contacts: number; documents: number; attachments: number; templates: number };
  projection: { trackedDays: number; storageDaysToFull: number | null; dbDaysToFull: number | null };
  errors: string[];
};

export const USAGE_CACHE_KEY = "rc:usageWorst:v1";

const SUPABASE_REF = "xhjhzfenoyjuvozygsld";
const LINKS = {
  supabaseUsage: `https://supabase.com/dashboard/project/${SUPABASE_REF}/settings/billing/usage`,
  supabaseBilling: `https://supabase.com/dashboard/project/${SUPABASE_REF}/settings/billing/subscription`,
  supabaseBackups: `https://supabase.com/dashboard/project/${SUPABASE_REF}/database/backups/scheduled`,
  vercelProject: "https://vercel.com/primas-projects-c35c228c/returnchecks",
  vercelUsage: "https://vercel.com/dashboard/usage",
  github: "https://github.com/lpinfo5321/jaime-notes",
};

function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtDays(d: number | null) {
  if (d == null) return "—";
  if (d > 365 * 5) return "más de 5 años";
  if (d >= 365) return `${(d / 365).toFixed(1)} años`;
  if (d >= 60) return `${Math.round(d / 30)} meses`;
  return `${d} días`;
}

function tone(pct: number) {
  if (pct >= 0.85) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "Cerca del límite" };
  if (pct >= 0.6) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Atención" };
  return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Bien" };
}

function Meter({ title, used, limit, hint }: { title: string; used: number; limit: number; hint?: string }) {
  const pct = limit > 0 ? used / limit : 0;
  const t = tone(pct);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-bold text-zinc-900 dark:text-white">{title}</div>
        <div className={`text-xs font-bold ${t.text}`}>{t.label}</div>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full transition-all ${t.bar}`} style={{ width: `${Math.min(100, Math.max(1.5, pct * 100))}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {fmtBytes(used)} de {fmtBytes(limit)}
        </span>
        <span className="font-semibold">{(pct * 100).toFixed(pct < 0.1 ? 1 : 0)}%</span>
      </div>
      {hint ? <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export default function UsageModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/usage", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo leer el uso");
      setData(j);
      const worst = Math.max(j.usage.dbBytes / j.limits.dbBytes, j.usage.storageBytes / j.limits.storageBytes);
      try {
        localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ ts: Date.now(), worst }));
      } catch {}
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const worst = useMemo(() => {
    if (!data) return 0;
    return Math.max(data.usage.dbBytes / data.limits.dbBytes, data.usage.storageBytes / data.limits.storageBytes);
  }, [data]);
  const t = tone(worst);

  return createPortal(
    <div className="rc-usage-back" onClick={onClose}>
      <style>{`
        .rc-usage-back{position:fixed!important;inset:0!important;z-index:2147483000!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px!important;background:rgba(15,23,42,.55)!important;overflow:hidden!important}
        .rc-usage-card{width:min(720px,100%)!important;max-height:calc(100dvh - 32px)!important;max-height:calc(100svh - 32px)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;margin:0!important;position:relative!important;top:auto!important;bottom:auto!important;transform:none!important}
        .rc-usage-body{min-height:0!important;flex:1 1 auto!important;overflow-y:auto!important}
      `}</style>
      <div
        className="rc-usage-card flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-zinc-50 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mr-auto">
            <div className="text-base font-black tracking-tight text-zinc-900 dark:text-white">Herramientas y límites</div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Cuánto llevas usado del plan gratis</div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Actualizar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rc-usage-body space-y-4 overflow-y-auto p-4">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando uso…
            </div>
          ) : err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
          ) : data ? (
            <>
              {/* Estado general */}
              <div
                className={`flex items-start gap-3 rounded-2xl border p-4 ${
                  worst >= 0.85
                    ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
                    : worst >= 0.6
                      ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                      : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                }`}
              >
                {worst >= 0.6 ? (
                  <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${t.text}`} />
                ) : (
                  <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${t.text}`} />
                )}
                <div className="text-sm text-zinc-800 dark:text-zinc-100">
                  {worst >= 0.85 ? (
                    <>
                      <b>Estás cerca del límite gratis.</b> Libera espacio (vacía la papelera, borra fotos que ya no necesitas) o
                      pasa a un plan de pago antes de que la app deje de guardar.
                    </>
                  ) : worst >= 0.6 ? (
                    <>
                      <b>Vas por buen camino, pero ya usaste más de la mitad.</b> Revisa esta pantalla cada mes y evita subir fotos
                      muy pesadas.
                    </>
                  ) : (
                    <>
                      <b>Todo bien.</b> Usas una parte pequeña del plan gratis; no necesitas pagar por ahora.
                    </>
                  )}
                </div>
              </div>

              {/* Medidores */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Meter
                  title="Archivos (fotos y PDFs)"
                  used={data.usage.storageBytes}
                  limit={data.limits.storageBytes}
                  hint={`Reportes: ${fmtBytes(data.usage.attachmentsBytes)} · Documentos: ${fmtBytes(data.usage.documentsBytes)}`}
                />
                <Meter
                  title="Base de datos (estimado)"
                  used={data.usage.dbBytes}
                  limit={data.limits.dbBytes}
                  hint="Textos, notas y contactos. El panel de Supabase suma además ~40-60 MB del sistema."
                />
              </div>
              <Meter
                title="Archivo más pesado"
                used={data.usage.largestFileBytes}
                limit={data.limits.fileMaxBytes}
                hint="Supabase gratis no acepta archivos de más de 50 MB."
              />

              {/* Proyección */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="font-bold text-zinc-900 dark:text-white">A tu ritmo actual</div>
                <ul className="mt-1.5 space-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
                  <li>
                    Archivos llenos en: <b>{fmtDays(data.projection.storageDaysToFull)}</b>
                  </li>
                  <li>
                    Base de datos llena en: <b>{fmtDays(data.projection.dbDaysToFull)}</b>
                  </li>
                </ul>
                <div className="mt-1 text-[11px] text-zinc-400">Calculado con tus últimos {data.projection.trackedDays} días de uso.</div>
              </div>

              {/* Conteos */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Reportes", data.counts.reports],
                  ["Contactos", data.counts.contacts],
                  ["Documentos", data.counts.documents],
                  ["Fotos/adjuntos", data.counts.attachments],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-center dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="text-xl font-black tabular-nums text-zinc-900 dark:text-white">{n as number}</div>
                    <div className="text-[11px] font-semibold text-zinc-500">{label}</div>
                  </div>
                ))}
              </div>

              {/* Herramientas */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-bold text-zinc-900 dark:text-white">Herramientas que usa tu app</div>
                <div className="mt-3 space-y-4 text-[13px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-zinc-900 dark:text-white">Supabase</b>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Conectada · {data.latencyMs} ms
                      </span>
                      <span className="text-zinc-400">Plan gratis (verifica)</span>
                    </div>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      Base de datos, archivos, usuarios y datos en tiempo real. Límites gratis: 500 MB de base, 1 GB de archivos,
                      5 GB de transferencia al mes, 200 conexiones en vivo. <b>Se pausa si pasa 1 semana sin uso.</b> El plan
                      gratis no incluye respaldos diarios.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ExtLink href={LINKS.supabaseUsage}>Ver uso real (transferencia)</ExtLink>
                      <ExtLink href={LINKS.supabaseBackups}>Respaldos</ExtLink>
                      <ExtLink href={LINKS.supabaseBilling}>Cambiar de plan</ExtLink>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-zinc-900 dark:text-white">Vercel</b>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        En línea
                      </span>
                      <span className="text-zinc-400">Plan Hobby (verifica)</span>
                    </div>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      Es donde vive la página de la app. El plan gratis tiene límites mensuales de transferencia y ejecuciones, y
                      es para uso personal: si la app es de un negocio, revisa sus términos.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ExtLink href={LINKS.vercelProject}>Abrir proyecto</ExtLink>
                      <ExtLink href={LINKS.vercelUsage}>Ver uso</ExtLink>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-zinc-900 dark:text-white">GitHub</b>
                      <span className="text-zinc-400">Gratis</span>
                    </div>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">Guarda el código de la app. No guarda tus datos y no tiene riesgo de llenarse.</p>
                    <div className="mt-2">
                      <ExtLink href={LINKS.github}>Abrir repositorio</ExtLink>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cuándo pagar */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[13px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                <div className="text-sm font-bold text-zinc-900 dark:text-white">¿Cuándo conviene pagar?</div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>Cuando archivos o base de datos pasen del <b>80%</b> y ya no quieras borrar nada.</li>
                  <li>Si necesitas <b>respaldos automáticos</b> (si borras algo por error, en gratis no hay vuelta atrás).</li>
                  <li>Si no quieres que Supabase pause el proyecto por inactividad.</li>
                </ul>
                <p className="mt-2 text-zinc-500">
                  Supabase Pro cuesta unos 25 USD al mes (aprox.: 8 GB de base, 100 GB de archivos y respaldos diarios). Mientras
                  estés en verde, aprovecha el plan gratis.
                </p>
              </div>

              {data.errors.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Algunas lecturas fallaron: {data.errors.join(" · ")}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
