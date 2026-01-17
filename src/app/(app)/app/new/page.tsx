"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewNotePage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [openReport, setOpenReport] = useState(true);
  const [busy, setBusy] = useState(false);
  const canCreate = useMemo(() => companyName.trim().length > 0, [companyName]);

  async function create() {
    if (!canCreate || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: companyName.trim(),
          body: "",
          tags: [],
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
          Nueva compañía
        </div>
        <div className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
          Crear
        </div>

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Nombre de la compañía
          </label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ej. CPC CONCRETE LLC"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:ring-zinc-700"
          />

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
            onClick={() => router.replace("/app")}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            onClick={create}
            disabled={!canCreate || busy}
          >
            {busy ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

