"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  template_snapshot?: any;
  values?: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
};

type Props = {
  notes: NoteListItem[];
  coverUrls: Record<string, string>;
  attachmentMetaByNoteId: Record<
    string,
    { total: number; images: number; docs: number; firstDocName?: string }
  >;
  firstDocUrlsByNoteId: Record<
    string,
    { url: string; filename: string; mime: string }
  >;
};

type Entry = {
  id: string;
  date: string; // yyyy-mm-dd
  agent: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function toEntryArray(values: Record<string, unknown> | null | undefined): Entry[] {
  const raw = (values as any)?._entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => ({
      id: typeof e?.id === "string" ? e.id : "",
      date: typeof e?.date === "string" ? e.date : "",
      agent: typeof e?.agent === "string" ? e.agent : "",
      note: typeof e?.note === "string" ? e.note : "",
      createdAt:
        typeof e?.createdAt === "string" ? e.createdAt : new Date().toISOString(),
      updatedAt:
        typeof e?.updatedAt === "string" ? e.updatedAt : new Date().toISOString(),
    }))
    .filter((e: Entry) => !!e.id && !!e.date);
}

function sortEntriesDesc(entries: Entry[]) {
  return [...entries].sort((a, b) => {
    if ((a.date ?? "") !== (b.date ?? "")) return (b.date ?? "").localeCompare(a.date ?? "");
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

function formatDdMmYy(iso: string) {
  const d = new Date((iso || isoToday()) + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function NotesList({
  notes,
  coverUrls,
  attachmentMetaByNoteId,
  firstDocUrlsByNoteId,
}: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<{
    id: string;
    mode: "list" | "new" | "edit";
    entryId?: string;
  } | null>(null);
  const [pendingRemote, setPendingRemote] = useState(false);
  const suppressRemoteUntilRef = useRef<number>(0);
  const idsRef = useRef<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<{ id: string; title: string } | null>(
    null,
  );

  const [items, setItems] = useState<NoteListItem[]>(notes);

  useEffect(() => {
    // Cuando cambia el servidor (búsqueda / navegación), resincroniza.
    setItems(notes);
  }, [notes]);

  const empty = items.length === 0;
  const sorted = useMemo(() => items, [items]);

  useEffect(() => {
    idsRef.current = new Set(items.map((n) => String(n.id)));
  }, [items]);

  const openCompany = useMemo(() => {
    if (!open?.id) return null;
    return sorted.find((n) => n.id === open.id) ?? null;
  }, [open, sorted]);

  const markLocalWrite = () => {
    suppressRemoteUntilRef.current = Date.now() + 1500;
  };

  // Realtime cross-device updates (Supabase Realtime)
  useEffect(() => {
    let isCancelled = false;
    const supabase = createClient();
    let channel: any = null;
    let deleteChannel: any = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId || isCancelled) return;

      channel = supabase
        .channel(`notes-live-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notes",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (Date.now() < suppressRemoteUntilRef.current) return;
            // If a modal is open, defer refresh to avoid disrupting editing UX
            if (open) {
              setPendingRemote(true);
              return;
            }
            router.refresh();
          },
        )
        .subscribe();

      // DELETE events sometimes don't include user_id (replica identity),
      // so the filtered subscription above may miss deletes. Listen to deletes and
      // only react if the deleted id belongs to our current list.
      deleteChannel = supabase
        .channel(`notes-live-delete-${userId}`)
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notes" },
          (payload: any) => {
            if (Date.now() < suppressRemoteUntilRef.current) return;
            const deletedId =
              typeof payload?.old?.id === "string" ? String(payload.old.id) : null;
            if (!deletedId) return;
            if (!idsRef.current.has(deletedId)) return;
            if (open) {
              setPendingRemote(true);
              return;
            }
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (deleteChannel) supabase.removeChannel(deleteChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, open?.id]);

  // If we deferred a refresh while the modal was open, do it once it closes
  useEffect(() => {
    if (!open && pendingRemote) {
      setPendingRemote(false);
      router.refresh();
    }
  }, [open, pendingRemote, router]);

  function patchCompany(noteId: string, patch: Partial<NoteListItem>) {
    setItems((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    );
  }

  function removeCompany(noteId: string) {
    setItems((prev) => prev.filter((n) => n.id !== noteId));
  }

  function askDeleteCompany(id: string) {
    const t = sorted.find((n) => n.id === id);
    if (!t) return;
    setConfirmDel({ id, title: (t.title ?? "").trim() || "Sin nombre" });
  }

  async function doDeleteCompany(id: string) {
    suppressRemoteUntilRef.current = Date.now() + 1500;
    setBusyId(id);
    setConfirmDel(null);
    // Optimista: quitar de UI al instante
    removeCompany(id);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
    } catch {
      // Si falla, recargar para restaurar el estado real
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No hay compañías todavía. Crea la primera con <b>Nueva</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {sorted.map((note) => (
          <CompanyCard
            key={note.id}
            note={note}
            coverUrl={coverUrls[note.id] ?? null}
            meta={attachmentMetaByNoteId[String(note.id)] ?? null}
            firstDoc={firstDocUrlsByNoteId[String(note.id)] ?? null}
            busy={busyId === note.id}
            setBusy={(b) => setBusyId(b ? note.id : null)}
            onOpenList={() => setOpen({ id: note.id, mode: "list" })}
            onOpenNew={() => setOpen({ id: note.id, mode: "new" })}
            onPatch={(patch) => patchCompany(note.id, patch)}
            onLocalWrite={markLocalWrite}
            onDelete={() => askDeleteCompany(note.id)}
          />
        ))}
      </div>

      {openCompany ? (
        open?.mode === "list" ? (
          <CompanyListModal
            note={openCompany}
            onClose={() => setOpen(null)}
            onEdit={(entryId) => setOpen({ id: openCompany.id, mode: "edit", entryId })}
          />
        ) : (
          <CompanyModal
            note={openCompany}
            coverUrl={coverUrls[openCompany.id] ?? null}
            meta={attachmentMetaByNoteId[String(openCompany.id)] ?? null}
            firstDoc={firstDocUrlsByNoteId[String(openCompany.id)] ?? null}
            startOnNew={open?.mode === "new"}
            startOnEntryId={open?.mode === "edit" ? (open?.entryId ?? null) : null}
            onClose={() => setOpen(null)}
            onBusy={(b) => setBusyId(b ? openCompany.id : null)}
            onPatch={(patch) => patchCompany(openCompany.id, patch)}
            onDeleteCompany={() => {
              removeCompany(openCompany.id);
              setOpen(null);
            }}
            onLocalWrite={markLocalWrite}
          />
        )
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="Eliminar compañía"
          message={`¿Seguro que quieres eliminar "${confirmDel.title}"?`}
          confirmText="Sí, eliminar"
          cancelText="No"
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => doDeleteCompany(confirmDel.id)}
        />
      ) : null}
    </div>
  );
}

function CompanyCard({
  note,
  coverUrl,
  meta,
  firstDoc,
  busy,
  setBusy,
  onOpenList,
  onOpenNew,
  onPatch,
  onLocalWrite,
  onDelete,
}: {
  note: NoteListItem;
  coverUrl: string | null;
  meta: { total: number; images: number; docs: number; firstDocName?: string } | null;
  firstDoc: { url: string; filename: string; mime: string } | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onOpenList: () => void;
  onOpenNew: () => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onLocalWrite: () => void;
  onDelete: () => void;
}) {
  const [companyName, setCompanyName] = useState(note.title ?? "");
  const lastSavedNameRef = useRef(companyName);

  useEffect(() => {
    setCompanyName(note.title ?? "");
    lastSavedNameRef.current = note.title ?? "";
  }, [note.id, note.title]);

  useEffect(() => {
    const next = (companyName ?? "").trim();
    const prev = (lastSavedNameRef.current ?? "").trim();
    if (next === prev) return;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        // Update UI instantly
        onPatch({ title: companyName });
        onLocalWrite();
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: companyName }),
        });
        if (res.ok) {
          lastSavedNameRef.current = companyName;
        } else {
          // rollback if needed
          onPatch({ title: lastSavedNameRef.current });
        }
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName]);

  const entries = sortEntriesDesc(toEntryArray(note.values));
  const latest = entries[0] ?? null;
  const latestDate = latest?.date ?? isoToday();
  const latestAgent = (latest?.agent ?? "").trim();
  const latestText = (latest?.note ?? note.body ?? "").trim();
  const excerpt = latestText.replace(/\s+/g, " ").slice(0, 140);

  const isPdf = !!firstDoc && String(firstDoc.mime ?? "").includes("pdf");

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:shadow-lg dark:border-zinc-800/50 dark:bg-zinc-900 sm:p-5",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {/* Nombre de la compañía (editable) */}
      <input
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder="Nombre de la compañía…"
        className="mb-3 w-full truncate rounded-2xl border border-transparent bg-transparent px-3 text-center text-lg font-black uppercase tracking-tight text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:text-white dark:ring-zinc-700 sm:mb-4 sm:text-xl md:text-2xl"
      />

      <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 sm:grid-cols-[minmax(0,1fr)_44%] sm:gap-6">
        {/* Última Nota (abre modal) */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-zinc-500 dark:text-zinc-300 sm:text-sm">
              Última Nota
            </div>
            <button
              type="button"
              onClick={onOpenNew}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              title="Agregar nota"
            >
              + Nota
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenList}
            className="block w-full rounded-2xl bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 shadow-inner ring-zinc-300 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-900 sm:px-4 sm:py-3 sm:text-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold">{formatDdMmYy(latestDate)}</div>
              {latestAgent ? (
                <div className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200 sm:text-sm">
                  {latestAgent}
                </div>
              ) : null}
            </div>
            <div className="mt-1 text-xs leading-snug text-zinc-700 dark:text-zinc-200 sm:text-sm">
              {excerpt ? excerpt : "(sin contenido)"}
            </div>
          </button>

          <div className="mt-3 flex items-center justify-between gap-2">
            {meta?.total ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 sm:px-3 sm:py-1.5">
                <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {meta.total}
              </div>
            ) : null}
          </div>
        </div>

        {/* Portada (contain) */}
        <div className="flex items-center justify-center">
          <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Portada" src={coverUrl} className="h-full w-full object-contain" />
            ) : isPdf && firstDoc ? (
              <iframe title={firstDoc.filename} src={firstDoc.url} className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:text-sm">
                Sin portada
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {message}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyListModal({
  note,
  onClose,
  onEdit,
}: {
  note: NoteListItem;
  onClose: () => void;
  onEdit: (entryId: string) => void;
}) {
  const entries = sortEntriesDesc(toEntryArray(note.values));

  // lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="h-[92svh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Compañía
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold">
              {(note.title ?? "").trim() || "Sin nombre"}
            </div>
          </div>
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            Cerrar
          </button>
        </div>

        <div className="h-[calc(92svh-60px)] overflow-auto p-3 sm:p-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-2 text-sm font-semibold">Notas</div>

            {entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                No hay notas todavía.
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        {formatDdMmYy(e.date)}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {e.agent ? e.agent : "—"}
                      </div>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">
                      {e.note ? e.note : "(sin texto)"}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onEdit(e.id)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyModal({
  note,
  coverUrl,
  meta,
  firstDoc,
  startOnNew,
  startOnEntryId,
  onClose,
  onBusy,
  onPatch,
  onDeleteCompany,
  onLocalWrite,
}: {
  note: NoteListItem;
  coverUrl: string | null;
  meta: { total: number; images: number; docs: number; firstDocName?: string } | null;
  firstDoc: { url: string; filename: string; mime: string } | null;
  startOnNew: boolean;
  startOnEntryId: string | null;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onDeleteCompany: () => void;
  onLocalWrite: () => void;
}) {
  const [companyName, setCompanyName] = useState(note.title ?? "");
  const [entries, setEntries] = useState<Entry[]>(() => sortEntriesDesc(toEntryArray(note.values)));
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const [draftDate, setDraftDate] = useState<string>(selected?.date ?? isoToday());
  const [draftAgent, setDraftAgent] = useState<string>(selected?.agent ?? "");
  const [draftNote, setDraftNote] = useState<string>(selected?.note ?? "");

  useEffect(() => {
    setCompanyName(note.title ?? "");
    const nextEntries = sortEntriesDesc(toEntryArray(note.values));
    setEntries(nextEntries);
    setSelectedId(nextEntries[0]?.id ?? null);
    setDraftDate(nextEntries[0]?.date ?? isoToday());
    setDraftAgent(nextEntries[0]?.agent ?? "");
    setDraftNote(nextEntries[0]?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    if (!selected) return;
    setDraftDate(selected.date ?? isoToday());
    setDraftAgent(selected.agent ?? "");
    setDraftNote(selected.note ?? "");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startNew() {
    setSelectedId(null);
    setDraftDate(isoToday());
    setDraftAgent("");
    setDraftNote("");
  }

  // Mobile stability: lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // If user clicked "+ Nota", open directly in new-note mode
  useEffect(() => {
    if (startOnNew) startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnNew]);

  // If user wants to edit a specific entry (from list modal)
  useEffect(() => {
    if (!startOnEntryId) return;
    setSelectedId(startOnEntryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnEntryId]);

  async function saveCompanyName() {
    onBusy(true);
    try {
      onPatch({ title: companyName });
      onLocalWrite();
      await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: companyName }),
      });
    } finally {
      onBusy(false);
    }
  }

  async function saveEntry() {
    const date = (draftDate || isoToday()).slice(0, 10);
    const agent = (draftAgent ?? "").trim();
    const noteText = (draftNote ?? "").trim();
    const now = new Date().toISOString();
    const id = selectedId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

    const nextEntry: Entry = {
      id,
      date,
      agent,
      note: noteText,
      createdAt: selected?.createdAt ?? now,
      updatedAt: now,
    };

    const nextEntries = sortEntriesDesc([...entries.filter((e) => e.id !== id), nextEntry]);
    const nextValues = {
      ...(((note.values ?? {}) as Record<string, unknown>) ?? {}),
      _entries: nextEntries,
    } as Record<string, unknown>;

    const latest = nextEntries[0] ?? null;
    const nextBody = latest ? `${latest.agent ? latest.agent + " - " : ""}${latest.note}` : "";

    onBusy(true);
    try {
      onLocalWrite();
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: companyName, body: nextBody, values: nextValues }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      setEntries(nextEntries);
      setSelectedId(id);
      onPatch({ title: companyName, body: nextBody, values: nextValues });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando");
    } finally {
      onBusy(false);
    }
  }

  async function deleteEntry(entryId: string) {
    const ok = confirm("¿Eliminar esta nota? (Sí/No)");
    if (!ok) return;
    const nextEntries = entries.filter((e) => e.id !== entryId);
    const nextValues = {
      ...(((note.values ?? {}) as Record<string, unknown>) ?? {}),
      _entries: nextEntries,
    } as Record<string, unknown>;
    const latest = nextEntries[0] ?? null;
    const nextBody = latest ? `${latest.agent ? latest.agent + " - " : ""}${latest.note}` : "";

    onBusy(true);
    try {
      onLocalWrite();
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: nextBody, values: nextValues }),
      });
      if (!res.ok) throw new Error("No se pudo borrar");
      const sortedNext = sortEntriesDesc(nextEntries);
      setEntries(sortedNext);
      setSelectedId(sortedNext[0]?.id ?? null);
      onPatch({ body: nextBody, values: nextValues });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error borrando");
    } finally {
      onBusy(false);
    }
  }

  async function deleteCompany() {
    const ok = confirm("¿Eliminar esta compañía completa? (Sí/No)");
    if (!ok) return;
    onBusy(true);
    try {
      onLocalWrite();
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      onDeleteCompany();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error eliminando");
    } finally {
      onBusy(false);
    }
  }

  const isPdf = !!firstDoc && String(firstDoc.mime ?? "").includes("pdf");
  const isEditingExisting = !!selectedId && entries.some((e) => e.id === selectedId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="h-[92svh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Compañía
            </div>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onBlur={saveCompanyName}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-zinc-700"
              placeholder="Nombre de la compañía…"
            />
          </div>
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            Cerrar
          </button>
        </div>

        <div className="h-[calc(92svh-60px)] overflow-auto p-3 sm:p-4">
          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          {/* Lista de notas */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Todas las notas</div>
              <button
                type="button"
                onClick={startNew}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                + Nueva
              </button>
            </div>

            <div className="max-h-[55dvh] space-y-2 overflow-auto pr-1">
              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  Aún no hay notas. Crea la primera con “Nueva”.
                </div>
              ) : (
                entries.map((e) => {
                  const active = e.id === selectedId;
                  const small = (e.note ?? "").replace(/\s+/g, " ").slice(0, 60);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelectedId(e.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left text-sm",
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold opacity-90">
                            {formatDdMmYy(e.date)}
                          </div>
                          <div className="mt-0.5 truncate text-xs opacity-80">
                            {e.agent ? e.agent : "—"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            deleteEntry(e.id);
                          }}
                          title="Borrar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-1 text-xs opacity-80">{small || "(sin texto)"}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 text-sm font-semibold">{selectedId ? "Editar nota" : "Nueva nota"}</div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Fecha
                </span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  disabled={isEditingExisting}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
                />
                {isEditingExisting ? (
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    La fecha se mantiene igual (fecha de creación).
                  </div>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Agente
                </span>
                <input
                  value={draftAgent}
                  onChange={(e) => setDraftAgent(e.target.value)}
                  placeholder="Nombre del agente…"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Nota
              </span>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Escribe la nota…"
                className="min-h-[180px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700"
              />
            </label>

            {/* Controles abajo */}
            <div className="mt-4 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={deleteCompany}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Eliminar compañía
              </button>
              <button
                type="button"
                onClick={saveEntry}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Guardar
              </button>
            </div>

            {/* Preview opcional */}
            {(coverUrl || (isPdf && firstDoc) || meta?.total) ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Portada / Adjuntos
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverUrl} alt="Portada" className="h-full w-full object-contain" />
                    ) : isPdf && firstDoc ? (
                      <iframe title={firstDoc.filename} src={firstDoc.url} className="h-full w-full" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                        Sin portada
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    {meta?.total ? (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <Paperclip className="h-4 w-4" /> {meta.total} adjuntos
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        No hay adjuntos.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

