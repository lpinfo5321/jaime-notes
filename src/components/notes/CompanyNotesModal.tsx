"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, CheckCircle2, Copy, Download, ImageOff, MoreHorizontal, Paperclip, Pencil, Phone, Plus, SquarePen, Trash2, X } from "lucide-react";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { enqueueReport, flushQueuedReportsOnce, getQueuedReport, getQueuedReportsCount, removeQueuedReport } from "@/lib/reportQueue";
import { setSyncSnapshot } from "@/lib/syncStatus";
import { useDashPrefs } from "@/components/dashboard/dashPrefs";
import type { NoteListItem } from "./NotesList";
import { APPREPORTE_V, isoToday, toEntryArray, sortEntriesDesc, formatUsMmDdYy, parseMoneyToCents, formatUsd, getTotalDueFromValues, normText, pickField, getTotalDueCentsFromValues, isBucket, normalizePaymentToken, statusFromPaymentMethod, getLatestEntry, getLatestEntryDateIso, getLatestEntryDateTime, getLatestAgent, getCheckPaymentStatusText, getPayText, fitTextToSingleLineInput, type Entry } from "./notesUtils";

export default function CompanyNotesModal({
  companyName,
  notes: initialNotes,
  startInNew,
  onPatchNote,
  onLocalWrite,
  onClose,
}: {
  companyName: string;
  notes: NoteListItem[];
  startInNew: boolean;
  onPatchNote: (noteId: string, patch: Partial<NoteListItem>) => void;
  onLocalWrite: () => void;
  onClose: () => void;
}) {
  // Local copy of notes so we can update optimistically
  const [localNotes, setLocalNotes] = useState<NoteListItem[]>(initialNotes);

  // Which note to save new entries into (most recently updated)
  const targetNote = useMemo(
    () =>
      [...localNotes].sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      )[0] ?? localNotes[0] ?? null,
    [localNotes],
  );

  // All entries flattened, each tagged with its note id
  type TaggedEntry = Entry & { noteId: string };
  const allEntries = useMemo<TaggedEntry[]>(() => {
    const list: TaggedEntry[] = [];
    for (const n of localNotes) {
      for (const e of sortEntriesDesc(toEntryArray(n.values))) {
        list.push({ ...e, noteId: n.id });
      }
    }
    return list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [localNotes]);

  // Form state
  const [mode, setMode] = useState<"list" | "new" | "edit">(startInNew ? "new" : "list");
  const PER_PAGE = 4;
  const [notePage, setNotePage] = useState(0);
  const noteDesign = useDashPrefs().design;
  const isSticky = noteDesign === 8;
  const [anim, setAnim] = useState<null | { dir: "next" | "prev"; from: number; to: number }>(null);
  const pageCount = Math.max(1, Math.ceil(allEntries.length / PER_PAGE));
  const entriesOfPage = (idx: number) => allEntries.slice(idx * PER_PAGE, idx * PER_PAGE + PER_PAGE);
  function turnPage(dir: 1 | -1) {
    if (anim) return;
    const to = Math.min(pageCount - 1, Math.max(0, notePage + dir));
    if (to === notePage) return;
    setAnim({ dir: dir > 0 ? "next" : "prev", from: notePage, to });
  }
  function onPageFlipEnd() {
    setAnim((a) => {
      if (a) setNotePage(a.to);
      return null;
    });
  }
  const [editEntry, setEditEntry] = useState<TaggedEntry | null>(null);
  const [draftDate, setDraftDate] = useState(isoToday());
  const [draftAgent, setDraftAgent] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelEntry, setConfirmDelEntry] = useState<TaggedEntry | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus note textarea when opening form
  useEffect(() => {
    if (mode === "new" || mode === "edit") {
      setTimeout(() => noteRef.current?.focus(), 80);
    }
  }, [mode]);

  // Populate form when editing
  useEffect(() => {
    if (mode === "edit" && editEntry) {
      setDraftDate(editEntry.date || isoToday());
      setDraftAgent(editEntry.agent || "");
      setDraftNote(editEntry.note || "");
    } else if (mode === "new") {
      setDraftDate(isoToday());
      setDraftAgent("");
      setDraftNote("");
    }
  }, [mode, editEntry]);

  // Salir de la ventana (clic afuera / X / Esc / flecha volver) con cambios sin guardar => preguntar.
  const [confirmLeave, setConfirmLeave] = useState<null | "close" | "back">(null);
  const requestLeaveRef = useRef<(kind: "close" | "back") => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestLeaveRef.current("close"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function patchLocalNote(noteId: string, patch: Partial<NoteListItem>) {
    setLocalNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)));
    onPatchNote(noteId, patch);
  }

  async function saveEntry(): Promise<boolean> {
    if (!targetNote) return false;
    const noteId = mode === "edit" && editEntry ? editEntry.noteId : targetNote.id;
    const noteObj = localNotes.find((n) => n.id === noteId) ?? targetNote;
    const date = (draftDate || isoToday()).slice(0, 10);
    const agent = draftAgent.trim();
    const noteText = draftNote.trim();
    const now = new Date().toISOString();
    const id =
      mode === "edit" && editEntry
        ? editEntry.id
        : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

    const existing = sortEntriesDesc(toEntryArray(noteObj.values));
    const nextEntry: Entry = {
      id,
      date,
      agent,
      note: noteText,
      createdAt: (mode === "edit" && editEntry ? editEntry.createdAt : null) ?? now,
      updatedAt: now,
    };
    const nextEntries = sortEntriesDesc([...existing.filter((e) => e.id !== id), nextEntry]);
    const latest = nextEntries[0] ?? null;
    const nextBody = latest ? `${latest.agent ? latest.agent + " - " : ""}${latest.note}` : "";
    const nextValues = {
      ...(((noteObj.values ?? {}) as Record<string, unknown>) ?? {}),
      _entries: nextEntries,
    } as Record<string, unknown>;

    setBusy(true);
    try {
      onLocalWrite();
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: nextBody, values: nextValues }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      patchLocalNote(noteId, { body: nextBody, values: nextValues });
      setMode("list");
      setEditEntry(null);
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteEntry(entry: TaggedEntry) {
    setConfirmDelEntry(null);
    const noteObj = localNotes.find((n) => n.id === entry.noteId);
    if (!noteObj) return;
    const existing = sortEntriesDesc(toEntryArray(noteObj.values));
    const nextEntries = existing.filter((e) => e.id !== entry.id);
    const latest = nextEntries[0] ?? null;
    const nextBody = latest ? `${latest.agent ? latest.agent + " - " : ""}${latest.note}` : "";
    const nextValues = {
      ...(((noteObj.values ?? {}) as Record<string, unknown>) ?? {}),
      _entries: nextEntries,
    } as Record<string, unknown>;

    setBusy(true);
    try {
      onLocalWrite();
      const res = await fetch(`/api/notes/${entry.noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: nextBody, values: nextValues }),
      });
      if (!res.ok) throw new Error("No se pudo borrar");
      patchLocalNote(entry.noteId, { body: nextBody, values: nextValues });
      if (mode === "edit" && editEntry?.id === entry.id) setMode("list");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error borrando");
    } finally {
      setBusy(false);
    }
  }

  const isForm = mode === "new" || mode === "edit";
  const visitedList = useRef(!startInNew);
  useEffect(() => { if (mode === "list") visitedList.current = true; }, [mode]);

  // ¿Hay algo escrito/cambiado que no se ha guardado?
  const baseDate = mode === "edit" && editEntry ? (editEntry.date || isoToday()) : isoToday();
  const baseAgent = mode === "edit" && editEntry ? (editEntry.agent || "") : "";
  const baseNote = mode === "edit" && editEntry ? (editEntry.note || "") : "";
  const dirty =
    isForm &&
    (draftNote.trim() !== baseNote.trim() ||
      draftAgent.trim() !== baseAgent.trim() ||
      (mode === "edit" && draftDate !== baseDate));

  function leave(kind: "close" | "back") {
    if (kind === "close" && !(isForm && visitedList.current)) onClose();
    else { setMode("list"); setEditEntry(null); }
  }
  requestLeaveRef.current = (kind) => {
    if (busy) return;
    if (confirmDelEntry) { setConfirmDelEntry(null); return; }
    if (confirmLeave) { setConfirmLeave(null); return; } // Esc con el aviso abierto = seguir editando
    if (dirty) setConfirmLeave(kind);
    else leave(kind);
  };
  const requestLeave = (kind: "close" | "back") => requestLeaveRef.current(kind);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => requestLeave("close")} />

      {confirmLeave ? (
        <UnsavedChangesDialog
          title={mode === "new" ? "¿Guardar esta nota?" : "¿Guardar los cambios?"}
          message={mode === "new" ? "Escribiste una nota que todavía no se ha guardado." : "Hiciste cambios en esta nota que todavía no se han guardado."}
          saveLabel={mode === "new" ? "Guardar nota" : "Guardar cambios"}
          canSave={!!draftNote.trim()}
          cantSaveHint="Para guardar, escribe el texto de la nota."
          saving={busy}
          onSave={async () => {
            const kind = confirmLeave;
            const ok = await saveEntry();
            if (ok) {
              setConfirmLeave(null);
              if (kind === "close") onClose();
            }
          }}
          onDiscard={() => { const kind = confirmLeave; setConfirmLeave(null); leave(kind); }}
          onKeepEditing={() => setConfirmLeave(null)}
        />
      ) : null}

      {/* Mini-modal confirmar eliminación */}
      {confirmDelEntry ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-sm animate-scale-in rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/40">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="mt-3 text-base font-black text-zinc-900 dark:text-white">¿Eliminar nota?</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {confirmDelEntry.date ? `Nota del ${formatUsMmDdYy(confirmDelEntry.date)}` : "Esta nota"}
              {confirmDelEntry.agent ? ` — ${confirmDelEntry.agent}` : ""}
              . Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelEntry(null)}
                className="flex-1 rounded-2xl border border-zinc-200 bg-white py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => doDeleteEntry(confirmDelEntry)}
                className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`animate-slide-up relative z-10 flex w-full max-w-2xl flex-col sm:animate-scale-in nb-modal overflow-visible bg-transparent shadow-none`}
        style={{ maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 hidden`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              {isForm ? (mode === "new" ? "Nueva Nota" : "Editar Nota") : "Notas"}
            </p>
            <h2 className="truncate text-base font-black uppercase tracking-tight text-zinc-900 dark:text-white">
              {companyName}
            </h2>
          </div>
          <div className="ml-3 flex items-center gap-2">
            {!isForm && (
              <button
                type="button"
                onClick={() => setMode("new")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                + Nueva
              </button>
            )}
            {/* En edición desde la lista → flecha volver; en cualquier otro caso → X cierra */}
            {mode === "edit" ? (
              <button
                type="button"
                onClick={() => requestLeave("back")}
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title="Volver a la lista"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => requestLeave("close")}
                disabled={busy}
                data-tour="notes-close"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={`min-h-0 flex-1 overscroll-contain overflow-visible`}>
          {isForm ? (
            /* ── Form: new / edit ── */
            <div className={`nb-open ${isSticky ? "is-sticky" : ""}`}>
              <div className="nb-page nb-formpage">
                <div className="nb-head">
                  <span>{mode === "new" ? "Nueva nota" : "Editar nota"} · {companyName}</span>
                  <span className="nb-tools">
                    <button type="button" onClick={() => (mode === "edit" ? requestLeave("back") : requestLeave("close"))} disabled={busy} title={mode === "edit" ? "Volver" : "Cerrar"}>{mode === "edit" ? "‹" : "×"}</button>
                  </span>
                </div>
                <div className="nb-fields">
                  <label className="nb-field">
                    <span>Fecha</span>
                    <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
                  </label>
                  <label className="nb-field">
                    <span>Agente</span>
                    <input type="text" value={draftAgent} onChange={(e) => setDraftAgent(e.target.value)} placeholder="Nombre del agente…" />
                  </label>
                </div>
                <div className="nb-field-label">Escribe tu nota</div>
                <textarea
                  ref={noteRef}
                  className="nb-textarea"
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Escribe aquí la nota…"
                  rows={7}
                />
                <div className="nb-actions">
                  <button
                    type="button"
                    className="nb-cancel"
                    disabled={busy}
                    onClick={() => {
                      if (busy) return;
                      if (mode === "edit" || visitedList.current) { setMode("list"); setEditEntry(null); }
                      else { onClose(); }
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" className="nb-save" onClick={saveEntry} disabled={busy || !draftNote.trim()}>
                    {busy ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "+ Agregar nota"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Libreta: las notas se pasan como hojas ── */
            <div className={`nb-open ${isSticky ? "is-sticky" : ""}`}>
              {(() => {
                const renderSheet = (idx: number, cls: string, interactive: boolean, onEnd?: () => void) => {
                  const list = entriesOfPage(idx);
                  return (
                    <div className={`nb-page ${cls}`} onAnimationEnd={onEnd} aria-hidden={!interactive}>
                      <div className="nb-head">
                        <span>{list[0]?.date ? formatUsMmDdYy(list[0].date) : "—"}</span>
                        <span className="nb-tools">
                          <span>{allEntries.length}</span>
                          <button type="button" onClick={() => requestLeave("close")} title="Cerrar">×</button>
                        </span>
                      </div>
                      <div className="nb-agent">Última nota{list[0]?.agent ? ` · ${list[0].agent}` : ""}</div>
                      {allEntries.length === 0 ? (
                        <button type="button" className="nb-empty" onClick={() => setMode("new")}>Escribe la primera nota</button>
                      ) : (
                        <ul className="nb-lines">
                          {list.map((entry, i) => (
                            <li key={entry.id || i} className={i > 0 ? "done" : ""}>
                              <span className="nb-box">{i > 0 ? "✓" : ""}</span>
                              <button type="button" className="nb-text" onClick={() => { setEditEntry(entry); setMode("edit"); }}>
                                {entry.note || "(sin contenido)"}
                              </button>
                              <button type="button" className="nb-del" disabled={busy} onClick={() => setConfirmDelEntry(entry)} title="Eliminar">×</button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="nb-foot">
                        <button type="button" className="nb-arrow" onClick={() => turnPage(-1)} disabled={idx === 0 || !!anim || pageCount < 2} aria-label="Hoja anterior">‹</button>
                        <button type="button" className="nb-add" onClick={() => setMode("new")} disabled={busy}>+ Nueva nota</button>
                        <span className="nb-count">{idx + 1} / {pageCount}</span>
                        <button type="button" className="nb-arrow" onClick={() => turnPage(1)} disabled={idx >= pageCount - 1 || !!anim || pageCount < 2} aria-label="Hoja siguiente">›</button>
                      </div>
                    </div>
                  );
                };
                if (!anim) return <div className="nb-stack">{renderSheet(notePage, "", true)}</div>;
                // La hoja de abajo ya muestra el destino; la de arriba se levanta (siguiente) o cae (anterior).
                return (
                  <div className="nb-stack">
                    {anim.dir === "next" ? (
                      <>
                        {renderSheet(anim.to, "under", false)}
                        {renderSheet(anim.from, "over flip-next", true, onPageFlipEnd)}
                      </>
                    ) : (
                      <>
                        {renderSheet(anim.from, "under", false)}
                        {renderSheet(anim.to, "over flip-prev", true, onPageFlipEnd)}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
