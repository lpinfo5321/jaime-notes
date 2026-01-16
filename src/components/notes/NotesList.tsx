"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import AttachmentsPanel from "@/components/notes/attachments/AttachmentsPanel";

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

function formatUsMmDdYy(iso: string) {
  const d = new Date((iso || isoToday()) + "T00:00:00");
  // US style: MM/DD/YY
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function parseMoneyToCents(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const num = Number(s.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function formatUsd(cents: number) {
  const n = cents / 100;
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function getTotalDueFromValues(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload;
  const raw = payload?.fields?.totalDue ?? payload?.fields?.total_due ?? payload?.totalDue;
  const cents = parseMoneyToCents(raw);
  if (cents === null) return { text: "$0.00", isSet: false };
  return { text: formatUsd(cents), isSet: true };
}

function getReportFieldText(
  values: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const payload = (values as any)?._report?.payload;
  const raw = payload?.fields?.[key];
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s : "RELLENAR";
}

function fitTextToSingleLineInput(
  el: HTMLInputElement | null,
  opts?: { minPx?: number },
) {
  if (!el) return;
  const minPx = opts?.minPx ?? 12;

  // Reset any previous override so we start from CSS font-size (responsive).
  el.style.fontSize = "";

  const maxPx = Number.parseFloat(window.getComputedStyle(el).fontSize || "0") || 16;
  let lo = minPx;
  let hi = Math.max(minPx, Math.floor(maxPx));

  // If it already fits at max size, keep CSS default.
  if (el.scrollWidth <= el.clientWidth) return;

  // Binary search smallest font that fits.
  // We want the biggest size that fits, so we search and keep best.
  let best = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= el.clientWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = `${best}px`;
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
  const [reportForCompany, setReportForCompany] = useState<{
    id: string;
    title: string;
    values: Record<string, unknown> | null;
    coverUrl: string | null;
  } | null>(null);

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
            onOpenReport={() =>
              setReportForCompany({
                id: note.id,
                title: (note.title ?? "").trim() || "Sin nombre",
                values: (note.values ?? null) as Record<string, unknown> | null,
                coverUrl: coverUrls[note.id] ?? null,
              })
            }
            onPatch={(patch) => patchCompany(note.id, patch)}
            onLocalWrite={markLocalWrite}
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
            startOnNew={open?.mode === "new"}
            startOnEntryId={open?.mode === "edit" ? (open?.entryId ?? null) : null}
            onClose={() => setOpen(null)}
            onBusy={(b) => setBusyId(b ? openCompany.id : null)}
            onPatch={(patch) => patchCompany(openCompany.id, patch)}
            onLocalWrite={markLocalWrite}
          />
        )
      ) : null}

      {reportForCompany ? (
        <ReportModal
          noteId={reportForCompany.id}
          companyTitle={reportForCompany.title}
          initialReport={(reportForCompany.values as any)?._report?.payload ?? null}
          onLocalReportUpdate={(payload) => {
            const now = new Date().toISOString();
            const nextValues = {
              ...((reportForCompany.values ?? {}) as Record<string, unknown>),
              _report: { payload, updatedAt: now },
            } as Record<string, unknown>;
            patchCompany(reportForCompany.id, { values: nextValues });
            setReportForCompany((prev) => (prev ? { ...prev, values: nextValues } : prev));
          }}
          onClose={() => setReportForCompany(null)}
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
  onOpenReport,
  onPatch,
  onLocalWrite,
}: {
  note: NoteListItem;
  coverUrl: string | null;
  meta: { total: number; images: number; docs: number; firstDocName?: string } | null;
  firstDoc: { url: string; filename: string; mime: string } | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onOpenList: () => void;
  onOpenNew: () => void;
  onOpenReport: () => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onLocalWrite: () => void;
}) {
  const [companyName, setCompanyName] = useState(note.title ?? "");
  const lastSavedNameRef = useRef(companyName);
  const companyNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCompanyName(note.title ?? "");
    lastSavedNameRef.current = note.title ?? "";
  }, [note.id, note.title]);

  // Auto-fit company name so it stays on a single line (no ellipsis).
  useEffect(() => {
    const el = companyNameInputRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() =>
      fitTextToSingleLineInput(el, { minPx: 12 }),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [companyName]);

  useEffect(() => {
    const onResize = () => fitTextToSingleLineInput(companyNameInputRef.current, { minPx: 12 });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const totalDue = getTotalDueFromValues(note.values);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm transition hover:shadow-lg dark:border-zinc-800/50 dark:bg-zinc-900 sm:p-5",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {/* Nombre de la compañía (editable) */}
      <input
        ref={companyNameInputRef}
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder="Nombre de la compañía…"
        className="mb-3 w-full rounded-2xl border border-transparent bg-transparent px-3 text-center text-lg font-black uppercase tracking-tight text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:text-white dark:ring-zinc-700 sm:mb-4 sm:text-xl md:text-2xl"
      />

      <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3 sm:grid-cols-[minmax(0,1fr)_44%] sm:gap-6">
        {/* Última Nota (abre modal) */}
        <div className="min-w-0">
          {/* TOTAL DUE WITH FEES */}
          <div className="mb-3">
            <div className="mb-2 text-xs font-bold text-zinc-500 dark:text-zinc-300 sm:text-sm">
              Total
            </div>
            <div className="block w-full rounded-2xl bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 shadow-inner ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100 sm:px-4 sm:py-3 sm:text-sm">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300 sm:px-3 sm:py-1.5 sm:text-xs">
                <div className="truncate">TOTAL DUE WITH FEES</div>
              </div>
              <div
                className={cn(
                  "mt-2 border-t border-zinc-200/60 pt-2 text-base font-black tabular-nums sm:text-lg",
                  totalDue.isSet
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400",
                )}
              >
                {totalDue.text}
              </div>
            </div>
          </div>

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
            <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300 sm:px-3 sm:py-1.5 sm:text-xs">
              <div className="tabular-nums">{formatUsMmDdYy(latestDate)}</div>
              <div className="min-w-0 truncate text-zinc-800 dark:text-zinc-100">
                {latestAgent ? latestAgent : "—"}
              </div>
            </div>
            <div className="mt-2 border-t border-zinc-200/60 pt-2 text-xs leading-snug text-zinc-700 dark:border-zinc-800 dark:text-zinc-200 sm:text-sm">
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
          {coverUrl ? (
            <button
              type="button"
              onClick={onOpenReport}
              className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-md transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
              title="Abrir reporte (editar y ver imágenes)"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Portada"
                src={coverUrl}
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
                <div className="text-[11px] font-semibold text-white/90">Reporte</div>
                <div className="mt-1 inline-flex items-center rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
                  Abrir Return Checks →
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenReport}
              className="group/report aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-left shadow-md transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-zinc-700"
              title="Abrir reporte (editar y ver imágenes)"
            >
              <div className="flex h-full w-full flex-col justify-between py-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Reporte
                  </div>
                  <div className="mt-1 text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                    Return Checks
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    Toca para abrir y editar
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  Abrir reporte →
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportModal({
  noteId,
  companyTitle,
  initialReport,
  onLocalReportUpdate,
  onClose,
}: {
  noteId: string;
  companyTitle: string;
  initialReport: any;
  onLocalReportUpdate: (payload: unknown) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const preparedResolverRef = useRef<((ok: boolean) => void) | null>(null);

  function postToIframe(message: unknown) {
    try {
      iframeRef.current?.contentWindow?.postMessage(message, "*");
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev?.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "rc:print") {
        // parent-driven print (works better on mobile)
        void printFromParent();
      }
      if (data.type === "rc:prepared" && (data as any).noteId === noteId) {
        preparedResolverRef.current?.(true);
        preparedResolverRef.current = null;
      }
      if (data.type === "rc:save" && data.noteId === noteId) {
        // Update UI immediately (card should reflect total without refresh)
        try {
          onLocalReportUpdate((data as any).payload);
        } catch {}

        // Throttle saves to avoid spamming DB while typing
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(async () => {
          try {
            await fetch(`/api/notes/${noteId}/report`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ payload: data.payload }),
            });
          } catch {
            // ignore
          }
        }, 450);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [noteId]);

  useEffect(() => {
    // keep report company name in sync with note title
    postToIframe({ type: "rc:setCompanyName", companyName: companyTitle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyTitle]);

  async function printFromParent() {
    const w = iframeRef.current?.contentWindow ?? null;
    const doc = iframeRef.current?.contentDocument ?? null;

    // Ask iframe to prepare (load/decode images) and wait briefly for ack.
    try {
      const ack = await new Promise<boolean>((resolve) => {
        preparedResolverRef.current = resolve;
        try {
          w?.postMessage({ type: "rc:preparePrint" }, "*");
        } catch {}
        window.setTimeout(() => {
          if (preparedResolverRef.current) {
            preparedResolverRef.current = null;
            resolve(false);
          }
        }, 6000);
      });
      void ack;
    } catch {
      // ignore
    }

    try {
      // Wait for fonts + images so print doesn't create blank pages.
      const fontsReady = (doc as any)?.fonts?.ready;
      if (fontsReady && typeof fontsReady.then === "function") {
        await fontsReady.catch(() => undefined);
      }

      const imgs = Array.from(doc?.images ?? []);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );

      await Promise.all(
        imgs.map((img) =>
          typeof (img as any).decode === "function"
            ? (img as any).decode().catch(() => undefined)
            : Promise.resolve(),
        ),
      );
    } catch {
      // ignore
    }

    try {
      w?.focus();
      w?.print();
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="h-[92svh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Reporte
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold">{companyTitle}</div>
          </div>
          <div className="ml-3 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={(e) => {
                e.stopPropagation();
                void printFromParent();
              }}
              title="Imprimir reporte"
            >
              Imprimir
            </button>
            <a
              href={`/appreporte/index.html?noteId=${encodeURIComponent(noteId)}&companyName=${encodeURIComponent(companyTitle)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={(e) => e.stopPropagation()}
              title="Abrir en una pestaña nueva"
            >
              Abrir en pestaña
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>
        </div>

        <div className="h-[calc(92svh-60px)] bg-zinc-100 dark:bg-zinc-950">
          <iframe
            title="Reporte Return Checks"
            ref={iframeRef}
            src={`/appreporte/index.html?noteId=${encodeURIComponent(noteId)}&companyName=${encodeURIComponent(companyTitle)}`}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
            onLoad={() => {
              try {
                postToIframe({ type: "rc:init", noteId, initialReport });
                postToIframe({ type: "rc:setCompanyName", companyName: companyTitle });
              } catch {}
            }}
          />
        </div>
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
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 sm:text-xs">
                      <div className="tabular-nums">{formatUsMmDdYy(e.date)}</div>
                      <div className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">
                        {e.agent ? e.agent : "—"}
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap border-t border-zinc-200/70 pt-2 text-sm dark:border-zinc-800">
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
  startOnNew,
  startOnEntryId,
  onClose,
  onBusy,
  onPatch,
  onLocalWrite,
}: {
  note: NoteListItem;
  startOnNew: boolean;
  startOnEntryId: string | null;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onLocalWrite: () => void;
}) {
  const [companyName, setCompanyName] = useState(note.title ?? "");
  const companyNameInputRef = useRef<HTMLInputElement | null>(null);
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

  // Auto-fit company name in the modal header too.
  useEffect(() => {
    const el = companyNameInputRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() =>
      fitTextToSingleLineInput(el, { minPx: 12 }),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [companyName]);

  useEffect(() => {
    const onResize = () => fitTextToSingleLineInput(companyNameInputRef.current, { minPx: 12 });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
              ref={companyNameInputRef}
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
                            {formatUsMmDdYy(e.date)}
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
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid grid-cols-2 gap-2">
                  <div className="block w-full rounded-2xl bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 shadow-inner ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100">
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                      <div className="truncate">CHECK AMOUNT</div>
                    </div>
                    <div className="mt-2 border-t border-zinc-200/60 pt-2 text-[11px] leading-snug text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                      <div className="flex gap-2">
                        <div className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">
                          DATE CHECK PAID:
                        </div>
                        <div className="min-w-0 truncate">
                          {getReportFieldText(note.values, "dateCheckPaid")}
                        </div>
                      </div>
                      <div className="mt-1 flex gap-2">
                        <div className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">
                          FORM OF PAYMENT:
                        </div>
                        <div className="min-w-0 truncate">
                          {getReportFieldText(note.values, "checkPaymentMethod")}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="block w-full rounded-2xl bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 shadow-inner ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100">
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                      <div className="truncate">CHECK FEE</div>
                    </div>
                    <div className="mt-2 border-t border-zinc-200/60 pt-2 text-[11px] leading-snug text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                      <div className="flex gap-2">
                        <div className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">
                          DATE FEE PAID:
                        </div>
                        <div className="min-w-0 truncate">
                          {getReportFieldText(note.values, "dateFeePaid")}
                        </div>
                      </div>
                      <div className="mt-1 flex gap-2">
                        <div className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">
                          FORM OF PAYMENT:
                        </div>
                        <div className="min-w-0 truncate">
                          {getReportFieldText(note.values, "feePaymentMethod")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveEntry}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Guardar
                </button>
              </div>
            </div>

            <div className="mt-4">
              <AttachmentsPanel noteId={note.id} />
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

