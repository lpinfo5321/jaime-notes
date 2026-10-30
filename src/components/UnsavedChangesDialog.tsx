"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Save, Trash2, PencilLine } from "lucide-react";

/**
 * Diálogo "¿Guardar los cambios?" que se muestra cuando el usuario intenta cerrar
 * una ventana (clic afuera, X o Esc) con cambios sin guardar.
 *
 * Tres opciones claras:
 *  - Guardar  (guarda y cierra)
 *  - Descartar (cierra sin guardar)
 *  - Seguir editando (vuelve a la ventana)
 */
export default function UnsavedChangesDialog({
  title = "¿Guardar los cambios?",
  message = "Hiciste cambios que todavía no se han guardado.",
  saveLabel = "Guardar",
  discardLabel = "Descartar",
  keepLabel = "Seguir editando",
  canSave = true,
  cantSaveHint,
  saving = false,
  onSave,
  onDiscard,
  onKeepEditing,
}: {
  title?: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  keepLabel?: string;
  /** Si es false, el botón Guardar se desactiva (p. ej. falta un campo obligatorio). */
  canSave?: boolean;
  cantSaveHint?: string;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  onKeepEditing: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Enter = guardar (si se puede). La tecla Esc la maneja quien abre el diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canSave && !saving) {
        e.preventDefault();
        e.stopPropagation();
        void onSave();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canSave, saving, onSave]);

  if (!mounted) return null;

  return createPortal(
    <div
      // Importante: evita que el clic "suba" (React propaga eventos a través del portal)
      // y cierre la ventana de abajo.
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !saving) onKeepEditing();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="overlay-backdrop animate-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147482000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="animate-scale-in w-full max-w-[380px] overflow-hidden rounded-[28px] border border-zinc-200/70 bg-white p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#0d121c]"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-8 ring-amber-50/60 dark:bg-amber-400/10 dark:ring-amber-400/5">
          <Save className="h-6 w-6" />
        </div>
        <h3 id="unsaved-title" className="mt-4 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{message}</p>
        {!canSave && cantSaveHint ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            {cantSaveHint}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!canSave || saving}
            className="btn-ink flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando…" : saveLabel}
          </button>
          <button
            type="button"
            onClick={onKeepEditing}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <PencilLine className="h-4 w-4" />
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={() => void onDiscard()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-[13px] font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            {discardLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
