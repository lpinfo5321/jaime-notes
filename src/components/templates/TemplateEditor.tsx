"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { FieldType, TemplateField } from "@/lib/types";

type TemplateDTO = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  updated_at: string;
  created_at: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: "text", label: "Texto corto" },
  { type: "textarea", label: "Texto largo" },
  { type: "number", label: "Número" },
  { type: "date", label: "Fecha" },
  { type: "select", label: "Selector (dropdown)" },
  { type: "checkbox", label: "Checkbox" },
  { type: "phone", label: "Teléfono" },
  { type: "currency", label: "Moneda" },
];

function slugKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function newField(type: FieldType): TemplateField {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const label =
    type === "text"
      ? "Campo"
      : type === "textarea"
        ? "Notas"
        : type === "number"
          ? "Cantidad"
          : type === "date"
            ? "Fecha"
            : type === "select"
              ? "Tipo"
              : type === "checkbox"
                ? "Confirmado"
                : type === "phone"
                  ? "Teléfono"
                  : "Monto";
  return {
    id,
    type,
    label,
    key: slugKey(label) || `campo_${id.slice(0, 6)}`,
    required: false,
    section: "General",
    width: "half",
    placeholder: "",
    options: type === "select" ? ["Opción 1", "Opción 2"] : undefined,
  };
}

function SortableRow({
  field,
  onChange,
  onRemove,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
  onRemove: () => void;
}) {
  const sortable = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        sortable.isDragging && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          className="mt-1 cursor-grab select-none rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          title="Arrastra para ordenar"
        >
          ↕
        </button>

        <div className="min-w-0 flex-1">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Etiqueta
              </span>
              <input
                value={field.label}
                onChange={(e) => {
                  const label = e.target.value;
                  onChange({ label, key: field.key ? field.key : slugKey(label) });
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Clave (se guarda en el registro)
              </span>
              <input
                value={field.key}
                onChange={(e) => onChange({ key: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Sección (opcional)
              </span>
              <input
                value={field.section ?? ""}
                onChange={(e) => onChange({ section: e.target.value })}
                placeholder="Ej. Datos del cheque"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Ancho
              </span>
              <select
                value={field.width ?? "half"}
                onChange={(e) =>
                  onChange({ width: e.target.value as "half" | "full" })
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="half">Medio</option>
                <option value="full">Completo</option>
              </select>
            </label>
          </div>

          <div className="mt-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Placeholder (opcional)
              </span>
              <input
                value={field.placeholder ?? ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                placeholder="Ej. 813-555-1234"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              Tipo: <b>{field.type}</b>
            </span>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
              />
              Requerido
            </label>

            <button
              type="button"
              onClick={onRemove}
              className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Eliminar campo
            </button>
          </div>

          {field.type === "select" ? (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Opciones (una por línea)
              </div>
              <textarea
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  onChange({
                    options: e.target.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .slice(0, 60),
                  })
                }
                className="min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TemplateEditor({ template }: { template: TemplateDTO }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [fields, setFields] = useState<TemplateField[]>(template.fields ?? []);
  const [addType, setAddType] = useState<FieldType>("text");

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const payload = useMemo(
    () => ({
      name: name.trim() || "Plantilla",
      description: description.trim() ? description.trim() : null,
      fields,
    }),
    [name, description, fields],
  );

  useEffect(() => {
    const t = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/templates/${template.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("No se pudo guardar");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [payload, template.id]);

  async function removeTemplate() {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    if (res.ok) router.push("/templates");
  }

  function ensureUniqueKeys(next: TemplateField[]) {
    const used = new Set<string>();
    return next.map((f) => {
      let k = f.key.trim();
      if (!k) k = slugKey(f.label) || "campo";
      let base = k;
      let i = 2;
      while (used.has(k)) {
        k = `${base}_${i++}`;
      }
      used.add(k);
      return { ...f, key: k };
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Nombre
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Descripción (opcional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as FieldType)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {FIELD_TYPES.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setFields((prev) => ensureUniqueKeys([...prev, newField(addType)]))}
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Agregar campo
            </button>
            <button
              type="button"
              onClick={() => setFields((prev) => ensureUniqueKeys(prev))}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Arregla claves duplicadas automáticamente"
            >
              Normalizar claves
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-row gap-2 md:flex-col">
          <div
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-medium",
              saveState === "saving"
                ? "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                : saveState === "saved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : saveState === "error"
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                    : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
            )}
          >
            {saveState === "saving"
              ? "Guardando…"
              : saveState === "saved"
                ? "Guardado"
                : saveState === "error"
                  ? "Error al guardar"
                  : "—"}
          </div>
          <button
            type="button"
            onClick={removeTemplate}
            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold dark:text-zinc-100">Campos</div>
        {fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            Aún no hay campos. Agrega uno arriba.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              setFields((prev) => {
                const oldIndex = prev.findIndex((x) => x.id === active.id);
                const newIndex = prev.findIndex((x) => x.id === over.id);
                return arrayMove(prev, oldIndex, newIndex);
              });
            }}
          >
            <SortableContext
              items={fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {fields.map((f) => (
                  <SortableRow
                    key={f.id}
                    field={f}
                    onChange={(patch) =>
                      setFields((prev) =>
                        ensureUniqueKeys(
                          prev.map((x) => (x.id === f.id ? { ...x, ...patch } : x)),
                        ),
                      )
                    }
                    onRemove={() =>
                      setFields((prev) => prev.filter((x) => x.id !== f.id))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Nota: cuando creas una nota desde esta plantilla, se guarda un{" "}
        <b>snapshot</b> del formulario dentro del registro para que no cambie si
        editas la plantilla después.
      </div>
    </div>
  );
}

