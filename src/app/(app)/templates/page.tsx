import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id,name,description,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight dark:text-zinc-100">
              Plantillas
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Crea formularios reutilizables (campos, requeridos, orden).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/templates/presets/returned-check"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Crea una plantilla ejemplo estilo reporte"
            >
              Plantilla ejemplo (Returned Check)
            </Link>
            <Link
              href="/templates/new"
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Nueva plantilla
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Error cargando plantillas: {error.message}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates ?? []).map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-sm font-semibold dark:text-zinc-100">{t.name}</div>
              {t.description ? (
                <div className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {t.description}
                </div>
              ) : (
                <div className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">(sin descripción)</div>
              )}

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/templates/${t.id}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Editar
                </Link>
                <Link
                  href={`/app/from-template/${t.id}`}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Crear nota
                </Link>
              </div>
            </div>
          ))}
          {(templates ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 sm:col-span-2 lg:col-span-3">
              No hay plantillas todavía. Crea la primera con{" "}
              <b>Nueva plantilla</b>.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

