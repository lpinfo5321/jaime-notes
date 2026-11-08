"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Phone, Search } from "lucide-react";
import { matchCompanies, normCompany } from "@/lib/company";

type CompanyInfo = {
  name: string;
  reports: number;
  contacts: { id: string; name: string; phones: string[]; email: string | null }[];
};

export default function NewNotePage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [openReport, setOpenReport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<CompanyInfo[] | null>(null);

  // Deja lista la pantalla principal para que "Cancelar"/"Crear" sean instantáneos.
  useEffect(() => {
    try { router.prefetch("/app"); } catch {}
  }, [router]);

  // Lista de compañías que ya existen (para avisar si se repite)
  useEffect(() => {
    let alive = true;
    fetch("/api/companies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setCompanies(Array.isArray(j?.companies) ? j.companies : []);
      })
      .catch(() => {
        if (alive) setCompanies([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const trimmed = companyName.replace(/\s+/g, " ").trim();
  const canCreate = trimmed.length > 0;

  const matches = useMemo(
    () => (companies ? matchCompanies(trimmed, companies.map((c) => c.name)) : []),
    [companies, trimmed],
  );
  const exact = matches.find((m) => m.kind === "exact") ?? null;
  const similar = matches.filter((m) => m.kind === "similar");
  const exactInfo = exact ? companies?.find((c) => normCompany(c.name) === normCompany(exact.name)) ?? null : null;

  // Si ya existe, se usa SIEMPRE el nombre ya guardado (así los reportes quedan juntos en la misma compañía)
  const finalName = exact ? exact.name : trimmed;

  async function create(nameOverride?: string) {
    const name = (nameOverride ?? finalName).trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: name,
          body: "",
          // Si se abre el reporte al momento, nace como borrador: no aparece en la lista
          // hasta que se guarde con contenido (si se cierra vacío, se elimina).
          tags: openReport ? ["__draft"] : [],
          favorite: false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) throw new Error(json?.error || "No se pudo crear");

      const id = String(json.id);
      if (openReport) router.replace(`/app?openReport=${encodeURIComponent(id)}`);
      else router.replace("/app");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error creando");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
        <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-300">
          Nuevo reporte
        </div>
        <div className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
          Compañía
        </div>

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Nombre de la compañía
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ej. CPC CONCRETE LLC"
              autoFocus
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:ring-zinc-700"
            />
          </div>

          {/* ¿Ya existe? */}
          {exact ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0">
                  <p className="font-bold text-amber-900 dark:text-amber-200">
                    Esta compañía ya existe: {exact.name}
                  </p>
                  <p className="mt-0.5 text-[13px] text-amber-800/90 dark:text-amber-200/80">
                    Tiene {exactInfo?.reports ?? 0} {(exactInfo?.reports ?? 0) === 1 ? "reporte" : "reportes"}. Se agregará el
                    nuevo reporte <b>dentro de esa misma compañía</b>, no se crea otra.
                  </p>
                  {exactInfo?.contacts?.length ? (
                    <ul className="mt-2 space-y-0.5 text-[12px] text-amber-900/80 dark:text-amber-100/80">
                      {exactInfo.contacts.slice(0, 3).map((c) => (
                        <li key={c.id} className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          <span className="font-semibold">{c.name}</span>
                          {c.phones[0] ? <span>· {c.phones[0]}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : similar.length > 0 ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-500/25 dark:bg-sky-500/10">
              <p className="font-bold text-sky-900 dark:text-sky-200">¿Es una de estas compañías?</p>
              <p className="mt-0.5 text-[12px] text-sky-800/90 dark:text-sky-200/80">
                Si es la misma, tócala para agregar el reporte dentro de ella.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {similar.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => setCompanyName(m.name)}
                    className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-bold text-sky-900 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={openReport}
              onChange={(e) => setOpenReport(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
            />
            Abrir reporte al crear
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            onClick={() => (window.history.length > 1 ? router.back() : router.replace("/app"))}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            onClick={() => void create()}
            disabled={!canCreate || busy}
          >
            {busy ? "Creando…" : exact ? "Agregar reporte a esta compañía" : "Crear compañía"}
          </button>
        </div>
      </div>
    </div>
  );
}
