"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import AttachmentsPanel from "@/components/notes/attachments/AttachmentsPanel";
import ExportButton from "./ExportButton";

type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  template_snapshot?: unknown;
  values?: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body ?? "");
  const [favorite, setFavorite] = useState(!!note.favorite);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>(
    (note.values ?? {}) as Record<string, unknown>,
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<number>(Date.now());

  const payload = useMemo(
    () => ({
      title,
      body,
      favorite,
      tags,
      values,
    }),
    [title, body, favorite, tags, values],
  );

  // Importante: NO resincronizar el estado local en cada refresh del servidor,
  // porque interrumpe la escritura. Solo se resetea al cambiar de nota.
  useEffect(() => {
    setTitle(note.title ?? "");
    setBody(note.body ?? "");
    setFavorite(!!note.favorite);
    setTags(note.tags ?? []);
    setValues((note.values ?? {}) as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("No se pudo guardar");
        lastSavedRef.current = Date.now();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [note.id, payload]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (t.length > 32) return;
    if (tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function removeNote() {
    if (!confirm("¿Eliminar esta nota?")) return;
    const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) router.push("/app");
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
          />
          {note.template_snapshot ? null : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe aquí…"
              className="mt-3 min-h-[220px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
            />
          )}
        </div>

        <div className="flex shrink-0 flex-row gap-2 md:flex-col">
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium",
              favorite
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
            )}
          >
            {favorite ? "★ Favorito" : "☆ Favorito"}
          </button>
          <button
            type="button"
            onClick={removeNote}
            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            Eliminar
          </button>
          <ExportButton note={note} />
        </div>
      </div>

      <div className="mt-4">
        <AttachmentsPanel noteId={note.id} />
      </div>

      {note.template_snapshot &&
      typeof note.template_snapshot === "object" &&
      note.template_snapshot !== null &&
      "fields" in note.template_snapshot ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold dark:text-zinc-50">
                {typeof (note.template_snapshot as any).name === "string"
                  ? (note.template_snapshot as any).name
                  : "Formulario"}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Estilo reporte: etiquetas a la izquierda y campos editables a la
                derecha.
              </div>
            </div>
          </div>
          <TemplateForm
            fields={(note.template_snapshot as any).fields ?? []}
            values={values}
            onChange={setValues}
          />
        </div>
      ) : null}

      {note.template_snapshot ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 text-sm font-semibold dark:text-zinc-50">Notas adicionales</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notas libres (opcional)…"
            className="min-h-[140px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
          />
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Tags</div>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => removeTag(t)}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Quitar tag"
            >
              #{t} ×
            </button>
          ))}
        </div>

        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
              setTagInput("");
            }
            if (e.key === "Backspace" && !tagInput && tags.length) {
              removeTag(tags[tags.length - 1]!);
            }
          }}
          placeholder="Escribe un tag y presiona Enter…"
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-400 dark:ring-zinc-600"
        />
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Ejemplos: <span className="font-medium">cliente</span>,{" "}
          <span className="font-medium">incidente</span>,{" "}
          <span className="font-medium">proveedor</span>.
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {saveState === "saving" ? (
            <span className="text-zinc-700 dark:text-zinc-300">Guardando…</span>
          ) : saveState === "saved" ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              Guardado ({new Date(lastSavedRef.current).toLocaleTimeString()})
            </span>
          ) : saveState === "error" ? (
            <span className="text-red-700 dark:text-red-400">Error al guardar</span>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {new Date(note.updated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function TemplateForm({
  fields,
  values,
  onChange,
}: {
  fields: any[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const bySection = new Map<string, any[]>();
  for (const f of fields) {
    const s = String(f?.section ?? "General").trim() || "General";
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s)!.push(f);
  }

  const inputBase =
    "w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-600";

  return (
    <div className="space-y-4">
      {Array.from(bySection.entries()).map(([section, fs]) => (
        <div
          key={section}
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {section}
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {fs.map((f) => {
              const key = String(f?.key ?? "");
              if (!key) return null;

              const label = String(f?.label ?? key);
              const type = String(f?.type ?? "text");
              const required = !!f?.required;
              const placeholder =
                typeof f?.placeholder === "string" ? f.placeholder : "";
              const v = values[key];

              const width = (f?.width === "full" ? "full" : "half") as
                | "half"
                | "full";

              const rowClass =
                width === "full"
                  ? "grid grid-cols-1 md:grid-cols-[260px_1fr]"
                  : "grid grid-cols-1 md:grid-cols-[260px_1fr]";

              return (
                <div key={String(f?.id ?? key)} className={rowClass}>
                  <div className="bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {label}{" "}
                    {required ? (
                      <span className="text-red-600 dark:text-red-400">*</span>
                    ) : null}
                  </div>
                  <div className="px-4 py-2">
                    {type === "textarea" ? (
                      <textarea
                        value={typeof v === "string" ? v : ""}
                        onChange={(e) =>
                          onChange({ ...values, [key]: e.target.value })
                        }
                        className={inputBase + " min-h-[110px] resize-y"}
                        required={required}
                        placeholder={placeholder}
                      />
                    ) : type === "checkbox" ? (
                      <label className="inline-flex items-center gap-2 px-1 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={!!v}
                          onChange={(e) =>
                            onChange({ ...values, [key]: e.target.checked })
                          }
                        />
                        Sí / No
                      </label>
                    ) : type === "select" ? (
                      <select
                        value={typeof v === "string" ? v : ""}
                        onChange={(e) =>
                          onChange({ ...values, [key]: e.target.value })
                        }
                        className={inputBase}
                        required={required}
                      >
                        <option value="">Selecciona…</option>
                        {(Array.isArray(f?.options) ? f.options : []).map(
                          (opt: any) => (
                            <option key={String(opt)} value={String(opt)}>
                              {String(opt)}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <input
                        value={
                          typeof v === "string" || typeof v === "number"
                            ? String(v)
                            : ""
                        }
                        onChange={(e) =>
                          onChange({ ...values, [key]: e.target.value })
                        }
                        type={
                          type === "date"
                            ? "date"
                            : type === "number" || type === "currency"
                              ? "number"
                              : type === "phone"
                                ? "tel"
                                : "text"
                        }
                        inputMode={
                          type === "phone"
                            ? "tel"
                            : type === "number" || type === "currency"
                              ? "decimal"
                              : "text"
                        }
                        className={inputBase}
                        required={required}
                        placeholder={placeholder}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

