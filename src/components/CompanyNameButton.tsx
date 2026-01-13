"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyName } from "@/lib/companyName";

export default function CompanyNameButton({ className }: { className?: string }) {
  const { companyName, setCompanyName } = useCompanyName();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(companyName);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(companyName);
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
          "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
          "dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
          className,
        )}
        title="Editar nombre de compañía"
      >
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">Compañía</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="text-sm font-semibold">Nombre de compañía</div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Se usa dentro de cada tarjeta.
              </div>
            </div>

            <div className="p-4">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ej. La Primavera"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-zinc-700"
              />
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Nota: esto se guarda en este dispositivo (si usas otro celular/PC,
                ponlo una vez ahí también).
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompanyName(draft || "NOMBRE DE COMPAÑÍA");
                  setOpen(false);
                }}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

