"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Download,
  ImageOff,
  MoreHorizontal,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import ContactsView from "@/components/contacts/ContactsView";
import DocumentsView from "@/components/documents/DocumentsView";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  enqueueReport,
  flushQueuedReportsOnce,
  getQueuedReport,
  getQueuedReportsCount,
  removeQueuedReport,
} from "@/lib/reportQueue";
import { setSyncSnapshot } from "@/lib/syncStatus";

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

type Bucket = "pending" | "completed" | "trash";

type LastAppLocation = {
  v: 1;
  ts: number;
  bucket: Bucket;
  view: "list" | "note" | "report";
  noteId?: string;
  noteMode?: "list" | "new" | "edit";
  entryId?: string;
  scrollY?: number;
};

const LAST_APP_LOCATION_KEY = "rc:lastAppLocation:v1";
const SELECT_MODE_KEY = "rc:selectMode:v1";
// Cache-buster para `public/appreporte/*` (Vercel a veces cachea el HTML/JS viejo).
// Sube este string cuando quieras forzar a todos a cargar la versión nueva.
const APPREPORTE_V = "20260123-3";

function readLastAppLocation(): LastAppLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_APP_LOCATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    if (typeof data.ts !== "number") return null;
    if (data.bucket !== "pending" && data.bucket !== "completed" && data.bucket !== "trash")
      return null;
    if (data.view !== "list" && data.view !== "note" && data.view !== "report") return null;
    return data as LastAppLocation;
  } catch {
    return null;
  }
}

function updateLastAppLocation(patch: Partial<LastAppLocation>) {
  if (typeof window === "undefined") return;
  try {
    const prev = readLastAppLocation();
    const next: LastAppLocation = {
      v: 1,
      ts: Date.now(),
      bucket: (patch.bucket ?? prev?.bucket ?? "pending") as Bucket,
      view: (patch.view ?? prev?.view ?? "list") as LastAppLocation["view"],
      noteId: patch.noteId ?? prev?.noteId,
      noteMode: patch.noteMode ?? prev?.noteMode,
      entryId: patch.entryId ?? prev?.entryId,
      scrollY: typeof patch.scrollY === "number" ? patch.scrollY : prev?.scrollY,
    };
    window.localStorage.setItem(LAST_APP_LOCATION_KEY, JSON.stringify(next));
  } catch {
    // ignore (storage might be blocked)
  }
}

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

function normText(v: unknown) {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim();
}

function pickField(fields: any, keys: string[]) {
  for (const k of keys) {
    const v = fields?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

function getTotalDueCentsFromValues(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload;
  const fields = payload?.fields ?? null;
  const raw = pickField(fields, ["totalDue", "total_due"]);
  const cents = parseMoneyToCents(raw);
  return cents === null ? 0 : Math.max(0, cents);
}

function isBucket(v: unknown): v is Bucket {
  return v === "pending" || v === "completed" || v === "trash";
}

function normalizePaymentToken(v: unknown) {
  const s = normText(v);
  if (!s) return "";
  if (s.toUpperCase() === "RELLENAR") return "";
  return s.toUpperCase();
}

function statusFromPaymentMethod(
  raw: unknown,
  opts: { allowRedeposited?: boolean },
): { text: string; tone: "pending" | "paid" } {
  const token = normalizePaymentToken(raw);
  if (!token) return { text: "Pending", tone: "pending" };
  // Algunos usuarios usan "REDEPOSITED" también en Fee; lo soportamos.
  if (opts.allowRedeposited && token === "REDEPOSITED")
    return { text: "Redeposited", tone: "paid" };
  if (token === "PAID CASH") return { text: "Paid Cash", tone: "paid" };
  if (token === "PAID CHECK") return { text: "Paid Check", tone: "paid" };
  return { text: "Pending", tone: "pending" };
}

function getLatestEntry(values: Record<string, unknown> | null | undefined): Entry | null {
  const arr = toEntryArray(values);
  if (!arr.length) return null;
  const sorted = sortEntriesDesc(arr);
  return sorted[0] ?? null;
}

function getLatestEntryDateIso(values: Record<string, unknown> | null | undefined): string {
  const e = getLatestEntry(values);
  const d = (e?.date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function getLatestEntryDateTime(values: Record<string, unknown> | null | undefined): number {
  const iso = getLatestEntryDateIso(values);
  const t = iso ? Date.parse(iso + "T00:00:00") : 0;
  return Number.isFinite(t) ? t : 0;
}

function getLatestAgent(values: Record<string, unknown> | null | undefined): string {
  const e = getLatestEntry(values);
  return normText(e?.agent);
}

function getCheckPaymentStatusText(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload ?? null;
  const fields = payload?.fields ?? null;
  const raw = pickField(fields, ["checkPaymentMethod", "check_payment_method"]);
  return statusFromPaymentMethod(raw, { allowRedeposited: true }).text;
}

function getPayText(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload ?? null;
  const fields = payload?.fields ?? null;
  const maker = pickField(fields, ["makerPayor", "maker_payor"]);
  const payee = pickField(fields, ["payee"]);
  return `${normText(maker)} ${normText(payee)}`.trim();
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
  const sp = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
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
  const [confirmBulkDel, setConfirmBulkDel] = useState<{ ids: string[]; count: number } | null>(
    null,
  );
  const [confirmMoveComplete, setConfirmMoveComplete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [bucket, setBucket] = useState<Bucket>("pending");
  const [actionsFor, setActionsFor] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Filters + sorting (local UI only; does not affect DB)
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [notesModal, setNotesModal] = useState<{ name: string; notes: NoteListItem[]; startInNew?: boolean } | null>(null);
  const [reportForCompany, setReportForCompany] = useState<{
    id: string;
    title: string;
    values: Record<string, unknown> | null;
    coverUrl: string | null;
  } | null>(null);

  const [items, setItems] = useState<NoteListItem[]>(notes);
  // Portadas: `coverUrls` viene del server (y no cambia “en vivo”).
  // Mantenemos un override local para que al guardar el reporte se refleje al instante.
  const [localCoverUrls, setLocalCoverUrls] = useState<Record<string, string>>(
    () => coverUrls ?? {},
  );
  const didRestoreRef = useRef(false);
  const handledOpenReportRef = useRef<string | null>(null);

  useEffect(() => {
    // Cuando cambia el servidor (búsqueda / navegación), resincroniza.
    setItems(notes);
  }, [notes]);

  useEffect(() => {
    // Mantener base del server, pero no pisar overrides locales recientes.
    setLocalCoverUrls((prev) => ({ ...(coverUrls ?? {}), ...(prev ?? {}) }));
  }, [coverUrls]);

  // Sync filters from URL (controlled by header UI)
  useEffect(() => {
    const qBy = (sp.get("qBy") ?? "company").trim() || "company";
    const q = (sp.get("q") ?? "").trim();
    const status = (sp.get("status") ?? "").trim();
    setFilterAgent(qBy === "pay" ? q : qBy === "company" ? q : "");
    setFilterStatus(qBy === "status" ? status : "");
  }, [sp]);

  // Soporte: /app?openReport=<noteId> (usado por /app/new)
  useEffect(() => {
    const id = (sp.get("openReport") ?? "").trim();
    if (!id) return;
    if (handledOpenReportRef.current === id) return;
    const note = items.find((n) => String(n.id) === id) ?? null;
    if (!note) return;

    handledOpenReportRef.current = id;
    setReportForCompany({
      id: note.id,
      title: (note.title ?? "").trim() || "Sin nombre",
      values: (note.values ?? null) as any,
      coverUrl: localCoverUrls?.[note.id] ?? null,
    });

    // Limpia el parámetro para que no se vuelva a disparar en refresh
    try {
      const params = new URLSearchParams(sp.toString());
      params.delete("openReport");
      const next = params.toString();
      router.replace(next ? `/app?${next}` : "/app");
    } catch {}
  }, [sp, items, localCoverUrls, router]);

  const empty = items.length === 0;
  const sorted = useMemo(() => items, [items]);

  // Botón "Inicio" del header → volver al dashboard principal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onGoDashboard = () => {
      setSelectedCompany(null);
      setShowContacts(false);
      setShowDocuments(false);
      setBucket("pending");
      setSelectMode(false);
      setSelectedIds(new Set());
      setOpen(null);
      setReportForCompany(null);
      setNotesModal(null);
    };
    const onShowContacts = () => {
      setShowContacts(true);
      setShowDocuments(false);
      setSelectedCompany(null);
      setOpen(null);
      setReportForCompany(null);
      setNotesModal(null);
    };
    const onShowDocuments = () => {
      setShowDocuments(true);
      setShowContacts(false);
      setSelectedCompany(null);
      setOpen(null);
      setReportForCompany(null);
      setNotesModal(null);
    };
    window.addEventListener("rc:goToDashboard" as any, onGoDashboard);
    window.addEventListener("rc:showContacts" as any, onShowContacts);
    window.addEventListener("rc:showDocuments" as any, onShowDocuments);
    return () => {
      window.removeEventListener("rc:goToDashboard" as any, onGoDashboard);
      window.removeEventListener("rc:showContacts" as any, onShowContacts);
      window.removeEventListener("rc:showDocuments" as any, onShowDocuments);
    };
  }, []);

  // Multi-select is only for list view; reset on bucket change or when opening modals.
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectedCompany(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);
  useEffect(() => {
    if (open || reportForCompany) {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [open, reportForCompany]);

  // Allow toggling select mode from header button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onToggle = () => {
      if (open || reportForCompany) return;
      setSelectMode((v) => !v);
      setSelectedIds(new Set());
    };
    window.addEventListener("rc:toggleSelectMode" as any, onToggle as any);
    return () => window.removeEventListener("rc:toggleSelectMode" as any, onToggle as any);
  }, [open, reportForCompany]);

  // Broadcast select-mode state so header can reflect it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SELECT_MODE_KEY, selectMode ? "1" : "0");
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent("rc:selectModeChanged", { detail: { selectMode } }),
      );
    } catch {}
  }, [selectMode]);

  useEffect(() => {
    idsRef.current = new Set(items.map((n) => String(n.id)));
  }, [items]);

  // Recordar y restaurar "donde estaba" al recargar/volver a entrar a /app
  // (layout effect para evitar el "salto" visual arriba→abajo)
  useLayoutEffect(() => {
    if (didRestoreRef.current) return;
    if (typeof window === "undefined") return;

    const loc = readLastAppLocation();
    if (!loc) return;

    // Si está súper viejo, ignóralo (7 días).
    if (Date.now() - loc.ts > 7 * 24 * 60 * 60 * 1000) return;

    // Siempre restaura la pestaña (bucket)
    setBucket(loc.bucket);

    const note = loc.noteId ? items.find((n) => n.id === loc.noteId) ?? null : null;
    if (loc.view === "report" && note) {
      setReportForCompany({
        id: note.id,
        title: (note.title ?? "").trim() || "Sin nombre",
        values: (note.values ?? null) as any,
        coverUrl: localCoverUrls?.[note.id] ?? null,
      });
    } else if (loc.view === "note" && note) {
      setOpen({
        id: note.id,
        mode: loc.noteMode ?? "list",
        entryId: loc.entryId,
      });
    }

    // Restaura el scroll del listado (si aplica)
    const y = typeof loc.scrollY === "number" ? loc.scrollY : 0;
    try {
      window.scrollTo(0, y);
    } catch {}

    didRestoreRef.current = true;
  }, [items, localCoverUrls]);

  // Guardar cambios de "ubicación" (nota abierta / reporte / pestaña)
  useEffect(() => {
    const view: LastAppLocation["view"] = reportForCompany
      ? "report"
      : open
        ? "note"
        : "list";
    const noteId = reportForCompany?.id ?? open?.id ?? undefined;
    updateLastAppLocation({
      bucket,
      view,
      noteId,
      noteMode: open?.mode,
      entryId: open?.entryId,
      scrollY: typeof window !== "undefined" ? window.scrollY || 0 : 0,
    });
  }, [bucket, open?.id, open?.mode, open?.entryId, reportForCompany?.id]);

  // Guardar scroll del listado mientras navegas
  useEffect(() => {
    if (typeof window === "undefined") return;
    let t: number | null = null;
    const onScroll = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        updateLastAppLocation({ scrollY: window.scrollY || 0 });
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (t) window.clearTimeout(t);
    };
  }, []);

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

  async function duplicateCompany(id: string) {
    suppressRemoteUntilRef.current = Date.now() + 1500;
    setBusyId(id);
    try {
      const src = items.find((n) => n.id === id) ?? null;
      const res = await fetch(`/api/notes/${id}/duplicate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) throw new Error(json?.error || "No se pudo duplicar");

      // La copia siempre es "Pendientes", así que cámbiate a esa pestaña para verla.
      setBucket("pending");

      // Optimista: insertar la copia en UI al instante para que NO "desaparezca"
      const now = new Date().toISOString();
      const newId = String(json.id);
      const newTitle = String(json.title ?? src?.title ?? "Sin nombre");
      const newValues = {
        _bucket: "pending",
        _report: { payload: json.reportPayload ?? null, updatedAt: now },
        _cover: null,
        _coverInline: null,
      } as Record<string, unknown>;

      setItems((prev) => {
        if (prev.some((n) => String(n.id) === newId)) return prev;
        const next: NoteListItem = {
          id: newId,
          title: newTitle,
          body: "",
          tags: [],
          favorite: false,
          template_snapshot: null,
          values: newValues,
          updated_at: now,
          created_at: now,
        };
        return [next, ...prev];
      });

      // Abrir el reporte de la copia inmediatamente
      setReportForCompany({
        id: newId,
        title: newTitle,
        values: newValues,
        coverUrl: null,
      });

      // Refresco en background para traer estado real del server
      window.setTimeout(() => {
        try {
          router.refresh();
        } catch {}
      }, 350);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error duplicando");
    } finally {
      setBusyId(null);
    }
  }

  function deriveBucketFromNote(n: NoteListItem): Bucket {
    const v = (n.values ?? null) as any;
    const stored = v?._bucket;
    if (isBucket(stored)) return stored;
    // Derivado: si falta status, lo calculamos sin persistir.
    const dueCents = getTotalDueCentsFromValues(n.values);
    const payload = v?._report?.payload ?? null;
    const fields = payload?.fields ?? null;
    const feeMethodRaw = pickField(fields, ["feePaymentMethod", "fee_payment_method"]);
    const checkMethodRaw = pickField(fields, ["checkPaymentMethod", "check_payment_method"]);
    const fee = statusFromPaymentMethod(feeMethodRaw, { allowRedeposited: true });
    const chk = statusFromPaymentMethod(checkMethodRaw, { allowRedeposited: true });
    const pending = fee.text === "Pending" || chk.text === "Pending" || dueCents <= 0;
    return pending ? "pending" : "completed";
  }

  const bucketCounts = useMemo(() => {
    const out: Record<Bucket, number> = { pending: 0, completed: 0, trash: 0 };
    for (const n of items) out[deriveBucketFromNote(n)] += 1;
    return out;
  }, [items]);

  const baseBucket = useMemo(() => {
    return sorted.filter((n) => deriveBucketFromNote(n) === bucket);
  }, [sorted, bucket]);

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of baseBucket) {
      const a = getLatestAgent(n.values);
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseBucket]);

  const visible = useMemo(() => {
    const pass = baseBucket.filter((n) => {
      if (filterAgent) {
        // filterAgent now means query text for company or pay (depending on mode)
        const q = filterAgent.toLowerCase();
        const qBy = (sp.get("qBy") ?? "company").trim() || "company";
        if (qBy === "pay") {
          const pay = getPayText(n.values).toLowerCase();
          if (!pay.includes(q)) return false;
        } else {
          const title = String(n.title ?? "").toLowerCase();
          if (!title.includes(q)) return false;
        }
      }
      if (filterStatus) {
        const s = getCheckPaymentStatusText(n.values);
        if (s !== filterStatus) return false;
      }
      return true;
    });
    return pass;
  }, [baseBucket, filterAgent, filterStatus, sp]);

  // Grouped dashboard: one entry per unique company name
  const companyGroups = useMemo(() => {
    const map = new Map<string, NoteListItem[]>();
    for (const n of visible) {
      const key = (n.title ?? "").trim() || "Sin nombre";
      const arr = map.get(key) ?? [];
      arr.push(n);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([name, notes]) => {
        const totalDueCents = notes.reduce(
          (sum, n) => sum + getTotalDueCentsFromValues(n.values),
          0,
        );
        const pendingCount = notes.filter((n) => deriveBucketFromNote(n) === "pending").length;
        const completedCount = notes.filter((n) => deriveBucketFromNote(n) === "completed").length;
        const lastActivity = notes.reduce((latest, n) => {
          const t = n.updated_at ?? "";
          return t > latest ? t : latest;
        }, "");
        // Latest entry/note across all reports for this company
        const allEntries = notes.flatMap((n) => sortEntriesDesc(toEntryArray(n.values)));
        const latestEntry = sortEntriesDesc(allEntries)[0] ?? null;
        const latestEntryDate = latestEntry?.date ?? "";
        const latestEntryAgent = (latestEntry?.agent ?? "").trim();
        const latestEntryText = (latestEntry?.note ?? "").trim();
        return {
          name,
          notes,
          totalDueCents,
          pendingCount,
          completedCount,
          lastActivity,
          latestEntryDate,
          latestEntryAgent,
          latestEntryText,
        };
      })
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notes visible when drilled into a specific company
  const visibleForCompany = useMemo(() => {
    if (!selectedCompany) return visible;
    return visible.filter((n) => (n.title ?? "").trim() === selectedCompany);
  }, [visible, selectedCompany]);

  const visibleIdSet = useMemo(() => new Set(visible.map((n) => String(n.id))), [visible]);
  const selectedInBucket = useMemo(() => {
    const ids: string[] = [];
    for (const id of selectedIds) if (visibleIdSet.has(String(id))) ids.push(String(id));
    return ids;
  }, [selectedIds, visibleIdSet]);
  const selectedCount = selectedInBucket.length;

  function toggleSelected(noteId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const id = String(noteId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(() => new Set(visible.map((n) => String(n.id))));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function setManyBucket(noteIds: string[], nextBucket: Bucket) {
    if (!noteIds.length) return;
    const idSet = new Set(noteIds.map(String));
    suppressRemoteUntilRef.current = Date.now() + 1500;
    markLocalWrite();
    setBulkBusy(true);
    const nextValuesById = new Map<string, Record<string, unknown>>();
    // Build payloads from current items so we never overwrite values on the server.
    for (const n of items) {
      const id = String(n.id);
      if (!idSet.has(id)) continue;
      const prevValues = ((n.values ?? {}) as Record<string, unknown>) ?? {};
      const nextValues = { ...prevValues, _bucket: nextBucket } as Record<string, unknown>;
      nextValuesById.set(id, nextValues);
    }

    setItems((prev) =>
      prev.map((n) => {
        const id = String(n.id);
        const nextValues = nextValuesById.get(id);
        return nextValues ? { ...n, values: nextValues } : n;
      }),
    );

    const results = await Promise.allSettled(
      noteIds.map(async (id) => {
        const nextValues = nextValuesById.get(String(id)) ?? { _bucket: nextBucket };
        const res = await fetch(`/api/notes/${encodeURIComponent(String(id))}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: nextValues }),
        });
        if (!res.ok) throw new Error("PATCH failed");
      }),
    );
    const anyFail = results.some((r) => r.status === "rejected");
    if (anyFail) router.refresh();
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function deleteMany(noteIds: string[]) {
    if (!noteIds.length) return;
    const idSet = new Set(noteIds.map(String));
    suppressRemoteUntilRef.current = Date.now() + 1500;
    markLocalWrite();
    setBulkBusy(true);
    setItems((prev) => prev.filter((n) => !idSet.has(String(n.id))));
    const results = await Promise.allSettled(
      noteIds.map(async (id) => {
        const res = await fetch(`/api/notes/${encodeURIComponent(String(id))}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("DELETE failed");
      }),
    );
    const anyFail = results.some((r) => r.status === "rejected");
    if (anyFail) router.refresh();
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function setNoteBucket(noteId: string, nextBucket: Bucket) {
    const target = items.find((n) => n.id === noteId);
    if (!target) return;
    const prev = ((target.values ?? {}) as Record<string, unknown>) ?? {};
    const nextValues = { ...prev, _bucket: nextBucket } as Record<string, unknown>;
    suppressRemoteUntilRef.current = Date.now() + 1500;
    patchCompany(noteId, { values: nextValues });
    markLocalWrite();
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: nextValues }),
      });
    } catch {
      router.refresh();
    }
  }

  function shouldSuggestMoveToCompleted(
    noteId: string,
    values: Record<string, unknown> | null | undefined,
  ) {
    const n = items.find((x) => String(x.id) === String(noteId)) ?? null;
    if (!n) return false;
    const currentBucket = deriveBucketFromNote(n);
    if (currentBucket === "trash") return false;
    if (currentBucket === "completed") return false;

    const payload = (values as any)?._report?.payload ?? null;
    const fields = payload?.fields ?? null;
    const feeMethodRaw = pickField(fields, ["feePaymentMethod", "fee_payment_method"]);
    const checkMethodRaw = pickField(fields, ["checkPaymentMethod", "check_payment_method"]);
    const fee = statusFromPaymentMethod(feeMethodRaw, { allowRedeposited: true });
    const chk = statusFromPaymentMethod(checkMethodRaw, { allowRedeposited: true });
    const dueCents = getTotalDueCentsFromValues(values);
    const isCompleted = fee.text !== "Pending" && chk.text !== "Pending" && dueCents > 0;
    return isCompleted;
  }

  function BucketBar() {
    const tabs: { id: Bucket; label: string; icon: React.ReactNode }[] = [
      { id: "pending", label: "Pendientes", icon: <Archive className="h-4 w-4" /> },
      { id: "completed", label: "Completados", icon: <CheckCircle2 className="h-4 w-4" /> },
      { id: "trash", label: "Papelera", icon: <Trash2 className="h-4 w-4" /> },
    ];
    return (
      <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-around px-3 py-2">
          {tabs.map((t) => {
            const active = bucket === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setBucket(t.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold",
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900",
                )}
              >
                {t.icon}
                <span className="truncate">{t.label}</span>
                <span
                  className={cn(
                    "ml-1 rounded-full px-2 py-0.5 text-xs font-black tabular-nums",
                    active
                      ? "bg-white/15 text-white dark:bg-zinc-900/15 dark:text-zinc-900"
                      : "bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200",
                  )}
                >
                  {bucketCounts[t.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function csvEscape(v: unknown) {
    const s = v == null ? "" : String(v);
    const needs = /[",\n\r]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  }

  function downloadText(filename: string, content: string, mime = "text/plain") {
    try {
      const blob = new Blob([content], { type: mime + ";charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // fallback
      try {
        (navigator as any)?.clipboard?.writeText?.(content);
        alert("No se pudo descargar. Copié el contenido al portapapeles.");
      } catch {
        alert("No se pudo descargar.");
      }
    }
  }

  function downloadBlob(filename: string, blob: Blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo descargar.");
    }
  }

  async function exportSelectedPdfsZip() {
    const ids = selectedInBucket;
    if (!ids.length) return;

    setBulkBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      const exportOne = (noteId: string) =>
        new Promise<{ filename: string; buffer: ArrayBuffer }>((resolve, reject) => {
          const note = items.find((n) => String(n.id) === String(noteId)) ?? null;
          const payload = (note?.values as any)?._report?.payload ?? null;
          const companyTitle = (note?.title ?? "").trim() || "Reporte";

          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.left = "-99999px";
          iframe.style.top = "0";
          iframe.style.width = "800px";
          iframe.style.height = "1100px";
          iframe.style.opacity = "0";
          iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads",
          );
          iframe.src = `/appreporte/index.html?noteId=${encodeURIComponent(noteId)}&companyName=${encodeURIComponent(companyTitle)}&v=${encodeURIComponent(APPREPORTE_V)}`;

          const reqId =
            (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

          let timeout: number | null = null;

          const cleanup = () => {
            window.removeEventListener("message", onMsg);
            if (timeout) window.clearTimeout(timeout);
            timeout = null;
            try {
              iframe.remove();
            } catch {}
          };

          const onMsg = (ev: MessageEvent) => {
            const data: any = ev?.data;
            if (!data || typeof data !== "object") return;
            if (data.type === "rc:exportPdfResult" && String(data.noteId) === String(noteId)) {
              if (data.requestId !== reqId) return;
              if (data.ok && data.buffer) {
                const filename = String(data.filename || `Returned Checks - ${companyTitle}.pdf`);
                const buffer = data.buffer as ArrayBuffer;
                cleanup();
                resolve({ filename, buffer });
              } else {
                cleanup();
                reject(new Error(String(data.error || "No se pudo exportar")));
              }
            }
          };

          window.addEventListener("message", onMsg);

          iframe.addEventListener("load", () => {
            try {
              // init payload to ensure data is present
              iframe.contentWindow?.postMessage(
                { type: "rc:init", noteId, initialReport: payload },
                "*",
              );
              // request export
              iframe.contentWindow?.postMessage(
                { type: "rc:exportPdf", noteId, requestId: reqId },
                "*",
              );
            } catch {}
          });

          timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("Tiempo de espera exportando PDF"));
          }, 45000);

          document.body.appendChild(iframe);
        });

      // Export sequentially to avoid memory spikes
      for (const id of ids) {
        const { filename, buffer } = await exportOne(String(id));
        zip.file(filename, buffer);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(`PDFs-${stamp}.zip`, blob);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error exportando PDFs");
    } finally {
      setBulkBusy(false);
    }
  }

  function exportSelectedCsv() {
    const ids = selectedInBucket;
    if (!ids.length) return;
    const idSet = new Set(ids.map(String));
    const rows = items.filter((n) => idSet.has(String(n.id)));
    const header = [
      "id",
      "company",
      "bucket",
      "total_due",
      "status_check",
      "status_fee",
      "latest_note_date",
      "latest_agent",
      "latest_note",
    ];
    const lines = [header.join(",")];
    for (const n of rows) {
      const bucketNow = deriveBucketFromNote(n);
      const total = formatUsd(getTotalDueCentsFromValues(n.values));
      const payload = (n.values as any)?._report?.payload ?? null;
      const fields = payload?.fields ?? null;
      const feeMethodRaw = pickField(fields, ["feePaymentMethod", "fee_payment_method"]);
      const checkMethodRaw = pickField(fields, ["checkPaymentMethod", "check_payment_method"]);
      const fee = statusFromPaymentMethod(feeMethodRaw, { allowRedeposited: true }).text;
      const chk = statusFromPaymentMethod(checkMethodRaw, { allowRedeposited: true }).text;
      const latest = getLatestEntry(n.values);
      const latestDate = latest?.date ? formatUsMmDdYy(latest.date) : "";
      const latestAgent = latest?.agent ?? "";
      const latestNote = latest?.note ?? "";
      const line = [
        csvEscape(n.id),
        csvEscape((n.title ?? "").trim()),
        csvEscape(bucketNow),
        csvEscape(total),
        csvEscape(chk),
        csvEscape(fee),
        csvEscape(latestDate),
        csvEscape(latestAgent),
        csvEscape(latestNote),
      ].join(",");
      lines.push(line);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`export-${stamp}.csv`, lines.join("\n"), "text/csv");
  }

  function MultiSelectBar() {
    if (!selectMode) return null;
    // Always show bar in select mode (even if 0 selected) so user can exit quickly.
    const showTrashActions = bucket === "trash";
    return (
      <div className="fixed inset-x-0 bottom-[68px] z-[65] px-3 pb-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 p-2 shadow-lg backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/35">
          <div className="min-w-0">
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
              Selección: <span className="tabular-nums">{selectedCount}</span>
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Toca los checks en las tarjetas
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={selectAllVisible}
              disabled={bulkBusy || visible.length === 0}
            >
              Seleccionar todo
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={clearSelection}
              disabled={bulkBusy || selectedCount === 0}
            >
              Limpiar
            </button>

            <div className="hidden h-8 w-px bg-zinc-200/80 dark:bg-zinc-800/70 sm:block" />

            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void setManyBucket(selectedInBucket, "pending")}
              disabled={bulkBusy || selectedCount === 0}
            >
              A Pendientes
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void setManyBucket(selectedInBucket, "completed")}
              disabled={bulkBusy || selectedCount === 0}
            >
              A Completados
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void setManyBucket(selectedInBucket, "trash")}
              disabled={bulkBusy || selectedCount === 0}
            >
              A Papelera
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={exportSelectedCsv}
              disabled={bulkBusy || selectedCount === 0}
              title="Exportar seleccionados"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void exportSelectedPdfsZip()}
              disabled={bulkBusy || selectedCount === 0}
              title="Exportar PDFs (ZIP)"
            >
              <Download className="h-4 w-4" />
              PDFs
            </button>

            {showTrashActions ? (
              <>
                <button
                  type="button"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-950/30"
                  onClick={() => void setManyBucket(selectedInBucket, "pending")}
                  disabled={bulkBusy || selectedCount === 0}
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200 dark:hover:bg-red-950/30"
                  onClick={() =>
                    setConfirmBulkDel({ ids: selectedInBucket, count: selectedCount })
                  }
                  disabled={bulkBusy || selectedCount === 0}
                >
                  Eliminar
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              onClick={() => {
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
              disabled={bulkBusy}
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  function CompanyActionsModal({
    id,
    title,
    onClose,
  }: {
    id: string;
    title: string;
    onClose: () => void;
  }) {
    const current = items.find((n) => n.id === id);
    const b = current ? deriveBucketFromNote(current) : "pending";
    const canRestore = b === "trash";
    const canDeleteForever = b === "trash";

    return (
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Acciones
            </div>
            <div className="mt-0.5 truncate text-sm font-bold">{title}</div>
          </div>

          <div className="p-3">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => {
                  void duplicateCompany(id);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <span>Duplicar</span>
                <Copy className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  void setNoteBucket(id, "pending");
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <span>Mover a Pendientes</span>
                <Archive className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void setNoteBucket(id, "completed");
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <span>Mover a Completados</span>
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void setNoteBucket(id, "trash");
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <span>Mover a Papelera</span>
                <Trash2 className="h-4 w-4" />
              </button>

              {canRestore ? (
                <button
                  type="button"
                  onClick={() => {
                    void setNoteBucket(id, "pending");
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-950/30"
                >
                  <span>Restaurar</span>
                  <ArchiveRestore className="h-4 w-4" />
                </button>
              ) : null}

              {canDeleteForever ? (
                <button
                  type="button"
                  onClick={() => {
                    askDeleteCompany(id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200 dark:hover:bg-red-950/30"
                >
                  <span>Eliminar definitivamente</span>
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
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

  // ── VISTA CONTACTOS (inline, sin navegación) ──
  if (showContacts) {
    return (
      <div className="animate-fade-in mx-auto w-full max-w-7xl pb-24">
        <ContactsView onBack={() => setShowContacts(false)} />
      </div>
    );
  }

  // ── VISTA DOCUMENTOS (inline, sin navegación) ──
  if (showDocuments) {
    return (
      <div className="animate-fade-in mx-auto w-full max-w-7xl pb-24">
        <DocumentsView onBack={() => setShowDocuments(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl pb-24">

      {/* ── DASHBOARD: tarjetas agrupadas por compañía ── */}
      {!selectedCompany ? (
        <div className="stagger-children grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {companyGroups.map((group) => (
            <DashboardCompanyCard
              key={group.name}
              name={group.name}
              totalDueCents={group.totalDueCents}
              pendingCount={group.pendingCount}
              completedCount={group.completedCount}
              checkCount={group.notes.length}
              lastActivity={group.lastActivity}
              latestEntryDate={group.latestEntryDate}
              latestEntryAgent={group.latestEntryAgent}
              latestEntryText={group.latestEntryText}
              onClick={() => setSelectedCompany(group.name)}
              onOpenNotes={() => setNotesModal({ name: group.name, notes: group.notes })}
              onQuickAdd={() => setNotesModal({ name: group.name, notes: group.notes, startInNew: true })}
            />
          ))}
        </div>
      ) : (
        /* ── DETALLE: reportes de la compañía seleccionada ── */
        <div>
          {/* Botón volver */}
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCompany(null)}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Dashboard
            </button>
            <h2 className="truncate text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white">
              {selectedCompany}
            </h2>
            <span className="ml-auto rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {visibleForCompany.length} {visibleForCompany.length === 1 ? "reporte" : "reportes"}
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {visibleForCompany.map((note) => (
              <CompanyCard
                key={note.id}
                note={note}
                coverUrl={localCoverUrls[note.id] ?? coverUrls[note.id] ?? null}
                meta={attachmentMetaByNoteId[String(note.id)] ?? null}
                firstDoc={firstDocUrlsByNoteId[String(note.id)] ?? null}
                busy={busyId === note.id}
                setBusy={(b) => setBusyId(b ? note.id : null)}
                selectMode={selectMode}
                selected={selectedIds.has(String(note.id))}
                onToggleSelected={() => toggleSelected(String(note.id))}
                onOpenList={() => setOpen({ id: note.id, mode: "list" })}
                onOpenNew={() => setOpen({ id: note.id, mode: "new" })}
                onOpenReport={() =>
                  setReportForCompany({
                    id: note.id,
                    title: (note.title ?? "").trim() || "Sin nombre",
                    values: (note.values ?? null) as Record<string, unknown> | null,
                    coverUrl: localCoverUrls[note.id] ?? null,
                  })
                }
                onPatch={(patch) => patchCompany(note.id, patch)}
                onLocalWrite={markLocalWrite}
                onDelete={() => askDeleteCompany(note.id)}
                onActions={() =>
                  setActionsFor({
                    id: note.id,
                    title: (note.title ?? "").trim() || "Sin nombre",
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

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

      {confirmBulkDel ? (
        <ConfirmDialog
          title="Eliminar seleccionados"
          message={`¿Eliminar definitivamente ${confirmBulkDel.count} compañía(s)?`}
          confirmText="Sí, eliminar"
          cancelText="No"
          onCancel={() => setConfirmBulkDel(null)}
          onConfirm={() => {
            const ids = confirmBulkDel.ids;
            setConfirmBulkDel(null);
            clearSelection();
            setSelectMode(false);
            void deleteMany(ids);
          }}
        />
      ) : null}

      {reportForCompany ? (
        <ReportModal
          noteId={reportForCompany.id}
          companyTitle={reportForCompany.title}
          initialReport={(reportForCompany.values as any)?._report?.payload ?? null}
          onLocalReportUpdate={(payload) => {
            const now = new Date().toISOString();
            const prevValues = ((reportForCompany.values ?? {}) as Record<string, unknown>) ?? {};
            const prevReport = (prevValues as any)?._report ?? null;

            // Guardar localmente el payload del reporte en forma "sanitizada"
            // (sin base64 ni signed URLs) para evitar estados gigantes y lentitud.
            let safePayload = payload as any;
            try {
              const imgs = Array.isArray((payload as any)?.images) ? (payload as any).images : [];
              const cleanImgs = imgs
                .map((im: any) => ({
                  id: typeof im?.id === "string" ? im.id : "",
                  name: typeof im?.name === "string" ? im.name : "Imagen",
                  path: typeof im?.path === "string" ? im.path : "",
                  createdAt: typeof im?.createdAt === "string" ? im.createdAt : undefined,
                }))
                .filter((im: any) => !!im.id && !!im.path);
              safePayload = { ...(payload ?? {}), images: cleanImgs };
            } catch {
              safePayload = payload as any;
            }

            const nextValues = {
              ...prevValues,
              _report: {
                ...(prevReport ?? {}),
                payload: safePayload,
                // Mantener el "updatedAt" del servidor; los cambios locales van por separado.
                updatedAt: typeof prevReport?.updatedAt === "string" ? prevReport.updatedAt : null,
                updatedBy: prevReport?.updatedBy ?? null,
                localUpdatedAt: now,
                localDirty: true,
              },
            } as Record<string, unknown>;

            // Portada SIEMPRE = primera imagen del reporte (según orden actual).
            try {
              const first = Array.isArray((payload as any)?.images)
                ? (payload as any).images[0]
                : null;
              const nextCover =
                typeof first?.dataUrl === "string" && String(first.dataUrl).startsWith("data:image/")
                  ? String(first.dataUrl)
                  : typeof first?.url === "string" && String(first.url).trim()
                    ? String(first.url).trim()
                    : null;
              const nextPath = typeof first?.path === "string" ? String(first.path) : null;

              if (nextCover) {
                nextValues._coverInline = {
                  dataUrl: nextCover,
                  filename: String(first.name || "Portada"),
                  updatedAt: now,
                };
                // inline cover takes precedence
                if (nextPath) {
                  nextValues._cover = { path: nextPath, updatedAt: now, filename: String(first.name || "Portada") } as any;
                } else {
                  nextValues._cover = null;
                }
                // Update local cover so the card updates immediately.
                setLocalCoverUrls((prev) => ({ ...(prev ?? {}), [reportForCompany.id]: nextCover }));
              } else if (nextPath) {
                // If we have a storage path (report images uploaded), use it as cover (server will sign it).
                nextValues._coverInline = null;
                nextValues._cover = { path: nextPath, updatedAt: now, filename: String(first?.name || "Portada") } as any;
                // Update local cover immediately by signing the path (avoid "blank cover" until refresh)
                void (async () => {
                  try {
                    const supabase = createClient();
                    const { data } = await supabase.storage
                      .from("attachments")
                      .createSignedUrl(nextPath, 60 * 60 * 24);
                    const signedUrl = data?.signedUrl ? String(data.signedUrl) : "";
                    if (signedUrl) {
                      setLocalCoverUrls((prev) => ({ ...(prev ?? {}), [reportForCompany.id]: signedUrl }));
                    }
                  } catch {
                    // ignore
                  }
                })();
              }
            } catch {}
            patchCompany(reportForCompany.id, { values: nextValues });
            setReportForCompany((prev) =>
              prev ? { ...prev, values: nextValues, coverUrl: localCoverUrls[reportForCompany.id] ?? prev.coverUrl } : prev,
            );
          }}
          onReportSynced={(meta) => {
            try {
              const prevValues = ((reportForCompany.values ?? {}) as Record<string, unknown>) ?? {};
              const prevReport = (prevValues as any)?._report ?? null;
              const nextValues = {
                ...prevValues,
                _report: {
                  ...(prevReport ?? {}),
                  updatedAt: typeof meta?.updatedAt === "string" ? meta.updatedAt : prevReport?.updatedAt ?? null,
                  updatedBy: meta?.updatedBy ?? prevReport?.updatedBy ?? null,
                  localDirty: false,
                  localUpdatedAt: null,
                },
              } as Record<string, unknown>;
              patchCompany(reportForCompany.id, { values: nextValues });
              setReportForCompany((prev) => (prev ? { ...prev, values: nextValues } : prev));
            } catch {
              // ignore
            }
          }}
          onClose={() => {
            const noteId = reportForCompany.id;
            const title = reportForCompany.title;
            const values = reportForCompany.values;
            setReportForCompany(null);
            if (shouldSuggestMoveToCompleted(noteId, values)) {
              setConfirmMoveComplete({ id: noteId, title });
            }
          }}
        />
      ) : null}

      {confirmMoveComplete ? (
        <ConfirmDialog
          title="Mover a Completados"
          message={`El reporte de "${confirmMoveComplete.title}" parece estar completo. ¿Quieres moverlo a Completados?`}
          confirmText="Sí, mover"
          cancelText="No"
          onCancel={() => setConfirmMoveComplete(null)}
          onConfirm={() => {
            const id = confirmMoveComplete.id;
            setConfirmMoveComplete(null);
            void setNoteBucket(id, "completed");
          }}
        />
      ) : null}

      {actionsFor ? (
        <CompanyActionsModal
          id={actionsFor.id}
          title={actionsFor.title}
          onClose={() => setActionsFor(null)}
        />
      ) : null}

      {/* ── Modal: todas las notas de una compañía ── */}
      {notesModal ? (
        <CompanyNotesModal
          companyName={notesModal.name}
          notes={notesModal.notes}
          startInNew={notesModal.startInNew ?? false}
          onPatchNote={(noteId, patch) => patchCompany(noteId, patch)}
          onLocalWrite={markLocalWrite}
          onClose={() => setNotesModal(null)}
        />
      ) : null}

      <MultiSelectBar />
      <BucketBar />
    </div>
  );
}

function CompanyNotesModal({
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patchLocalNote(noteId: string, patch: Partial<NoteListItem>) {
    setLocalNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)));
    onPatchNote(noteId, patch);
  }

  async function saveEntry() {
    if (!targetNote) return;
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
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando");
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

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />

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
        className="animate-slide-up relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-950 sm:animate-scale-in sm:rounded-3xl"
        style={{ maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
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
                onClick={() => { setMode("list"); setEditEntry(null); }}
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title="Volver a la lista"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { if (!busy) onClose(); }}
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {isForm ? (
            /* ── Form: new / edit ── */
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fecha</span>
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Agente</span>
                  <input
                    type="text"
                    value={draftAgent}
                    onChange={(e) => setDraftAgent(e.target.value)}
                    placeholder="Nombre del agente…"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Nota</span>
                <textarea
                  ref={noteRef}
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Escribe aquí la nota…"
                  rows={5}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
                />
              </label>
            </div>
          ) : (
            /* ── List of entries ── */
            <div className="px-4 py-4">
              {allEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">No hay notas todavía.</p>
                  <button
                    type="button"
                    onClick={() => setMode("new")}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    + Agregar primera nota
                  </button>
                </div>
              ) : (
                <div className="stagger-children space-y-2.5">
                  {allEntries.map((entry, i) => (
                    <div
                      key={entry.id || i}
                      className="animate-card-in rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 transition-shadow dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                            {formatUsMmDdYy(entry.date)}
                          </span>
                          {entry.agent ? (
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              {entry.agent}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => { setEditEntry(entry); setMode("edit"); }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                            title="Editar"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDelEntry(entry)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                        {entry.note || <span className="italic text-zinc-400">(sin contenido)</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {isForm && (
          <div className="shrink-0 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  if (mode === "edit") { setMode("list"); setEditEntry(null); }
                  else { onClose(); }
                }}
                disabled={busy}
                className="flex-1 rounded-2xl border border-zinc-200 bg-white py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEntry}
                disabled={busy || !draftNote.trim()}
                className="flex-1 rounded-2xl bg-zinc-900 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                {busy ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Agregar nota"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardCompanyCard({
  name,
  totalDueCents,
  pendingCount,
  completedCount,
  checkCount,
  lastActivity,
  latestEntryDate,
  latestEntryAgent,
  latestEntryText,
  onClick,
  onOpenNotes,
  onQuickAdd,
}: {
  name: string;
  totalDueCents: number;
  pendingCount: number;
  completedCount: number;
  checkCount: number;
  lastActivity: string;
  latestEntryDate: string;
  latestEntryAgent: string;
  latestEntryText: string;
  onClick: () => void;
  onOpenNotes: () => void;
  onQuickAdd: () => void;
}) {
  const totalDueText = formatUsd(totalDueCents);
  const allPaid = pendingCount === 0 && checkCount > 0;
  const lastDate = lastActivity
    ? new Date(lastActivity).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })
    : "—";
  const entryDateFmt = latestEntryDate ? formatUsMmDdYy(latestEntryDate) : "—";
  const excerpt = latestEntryText.replace(/\s+/g, " ").slice(0, 120);

  // Initials for avatar
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    // div instead of button to allow nested interactive elements (buttons inside)
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={cn(
        "animate-card-in group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-3xl border text-left",
        "transition-[transform,box-shadow] duration-200 ease-out",
        "hover:scale-[1.018] active:scale-[0.99]",
        "focus:outline-none focus:ring-2 focus:ring-white/20",
        "border-zinc-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)]",
        "hover:shadow-[0_12px_40px_rgba(15,23,42,0.13)]",
        "dark:border-white/[0.06] dark:bg-[#0f1117]",
        allPaid
          ? "dark:shadow-[0_4px_32px_rgba(16,185,129,0.08)] dark:hover:shadow-[0_12px_48px_rgba(16,185,129,0.14)]"
          : "dark:shadow-[0_4px_32px_rgba(239,68,68,0.06)] dark:hover:shadow-[0_12px_48px_rgba(239,68,68,0.12)]",
      )}
    >
      {/* Colored top accent bar */}
      <div className={cn(
        "h-[3px] w-full",
        allPaid
          ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 dark:from-emerald-500 dark:via-emerald-400 dark:to-teal-400"
          : "bg-gradient-to-r from-red-400 via-rose-500 to-orange-400 dark:from-red-500 dark:via-rose-400 dark:to-orange-400",
      )} />

      {/* Subtle glow overlay (dark only) */}
      <div className={cn(
        "pointer-events-none absolute inset-0 opacity-0 dark:opacity-100",
        allPaid
          ? "bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.07),transparent)]"
          : "bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(239,68,68,0.06),transparent)]",
      )} />

      <div className="relative flex flex-1 flex-col p-5">
        {/* Top row */}
        <div className="mb-4 flex items-start justify-between gap-3">
          {/* Avatar */}
          <div className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black tracking-tight",
            allPaid
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-1 dark:ring-emerald-500/20"
              : "bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300 dark:ring-1 dark:ring-white/10",
          )}>
            {initials || "?"}
          </div>

          {/* Badge + date */}
          <div className="flex flex-col items-end gap-1.5">
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-widest uppercase",
              allPaid
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-1 dark:ring-emerald-500/25"
                : "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400 dark:ring-1 dark:ring-red-500/25",
            )}>
              {allPaid ? "✓ All Paid" : `${pendingCount} Pending`}
            </span>
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600">
              {lastDate}
            </span>
          </div>
        </div>

        {/* Company name */}
        <h3 className="mb-3 truncate text-base font-black uppercase leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-lg">
          {name}
        </h3>

        {/* Total Due — hero number */}
        <div className={cn(
          "mb-4 rounded-2xl px-4 py-3",
          allPaid
            ? "bg-emerald-50 dark:bg-emerald-500/[0.07] dark:ring-1 dark:ring-emerald-500/15"
            : "bg-red-50 dark:bg-red-500/[0.07] dark:ring-1 dark:ring-red-500/15",
        )}>
          <p className={cn(
            "mb-0.5 text-[9px] font-black uppercase tracking-[0.15em]",
            allPaid ? "text-emerald-600 dark:text-emerald-500" : "text-red-500 dark:text-red-500",
          )}>
            Total Due with Fees
          </p>
          <p className={cn(
            "text-2xl font-black tabular-nums leading-none",
            allPaid
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-600 dark:text-red-300",
          )}
            style={allPaid
              ? { textShadow: "0 0 24px rgba(16,185,129,0.25)" }
              : { textShadow: "0 0 24px rgba(239,68,68,0.2)" }
            }
          >
            {totalDueText}
          </p>
        </div>

        {/* Última Nota */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
              Última Nota
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onQuickAdd(); }}
                className={cn(
                  "rounded-lg px-2 py-0.5 text-[10px] font-black transition",
                  "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10",
                )}
                title="Agregar nota rápida"
              >
                + Nota
              </button>
              <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600">
                Ver todas →
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}
            className={cn(
              "w-full rounded-xl px-3 py-2.5 text-left transition",
              "border border-zinc-100 bg-zinc-50 hover:bg-zinc-100",
              "dark:border-white/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
              "focus:outline-none",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="tabular-nums text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                {entryDateFmt}
              </span>
              {latestEntryAgent && (
                <span className="min-w-0 truncate text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                  {latestEntryAgent}
                </span>
              )}
            </div>
            <p className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">
              {excerpt || <span className="italic text-zinc-400 dark:text-zinc-600">(sin contenido)</span>}
            </p>
          </button>
        </div>

        {/* Stats row */}
        <div className="mt-auto grid grid-cols-3 gap-2">
          {/* Checks */}
          <div className="flex flex-col items-center rounded-xl border border-zinc-100 bg-zinc-50 py-2 dark:border-white/[0.05] dark:bg-white/[0.03]">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Checks</span>
            <span className="mt-0.5 text-base font-black tabular-nums text-zinc-700 dark:text-zinc-200">{checkCount}</span>
          </div>
          {/* Pending */}
          <div className={cn(
            "flex flex-col items-center rounded-xl border py-2",
            pendingCount > 0
              ? "border-red-100 bg-red-50 dark:border-red-500/15 dark:bg-red-500/[0.07]"
              : "border-zinc-100 bg-zinc-50 dark:border-white/[0.05] dark:bg-white/[0.03]",
          )}>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Pending</span>
            <span className={cn(
              "mt-0.5 text-base font-black tabular-nums",
              pendingCount > 0 ? "text-red-500 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200",
            )}>
              {pendingCount}
            </span>
          </div>
          {/* Paid */}
          <div className={cn(
            "flex flex-col items-center rounded-xl border py-2",
            completedCount > 0
              ? "border-emerald-100 bg-emerald-50 dark:border-emerald-500/15 dark:bg-emerald-500/[0.07]"
              : "border-zinc-100 bg-zinc-50 dark:border-white/[0.05] dark:bg-white/[0.03]",
          )}>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Paid</span>
            <span className={cn(
              "mt-0.5 text-base font-black tabular-nums",
              completedCount > 0 ? "text-emerald-500 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200",
            )}>
              {completedCount}
            </span>
          </div>
        </div>
      </div>
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
  selectMode,
  selected,
  onToggleSelected,
  onOpenList,
  onOpenNew,
  onOpenReport,
  onPatch,
  onLocalWrite,
  onDelete,
  onActions,
}: {
  note: NoteListItem;
  coverUrl: string | null;
  meta: { total: number; images: number; docs: number; firstDocName?: string } | null;
  firstDoc: { url: string; filename: string; mime: string } | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenList: () => void;
  onOpenNew: () => void;
  onOpenReport: () => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onLocalWrite: () => void;
  onDelete: () => void;
  onActions: () => void;
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

  const totalDue = getTotalDueFromValues(note.values);

  type MiniTone = "empty" | "pending" | "paid" | "emphasis";
  function MiniStat({
    label,
    value,
    tone,
    size = "md",
  }: {
    label: string;
    value?: string | null;
    tone: MiniTone;
    size?: "md" | "lg";
  }) {
    const showValue = (value ?? "").trim();
    const isEmpty = !showValue;
    // En estado vacío, los 3 deben verse iguales (mismo borde/fondo).
    const baseBox =
      "border-zinc-200 bg-white text-zinc-800 shadow-inner dark:border-zinc-800/60 dark:bg-zinc-950/50 dark:text-zinc-200";
    const toneClass =
      isEmpty
        ? baseBox
        : tone === "pending"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950/10 dark:text-red-300"
          : tone === "paid"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-950/10 dark:text-emerald-200"
            : baseBox;

    return (
      <div className="min-w-0">
        <div
          className={cn(
            "flex items-center justify-center px-1 text-center font-semibold leading-none tracking-tight text-zinc-500 dark:text-zinc-300",
            size === "lg" ? "h-8 text-[11px] sm:text-[12px]" : "h-7 text-[9px] sm:text-[10px] md:text-[11px]",
          )}
        >
          <div className="w-full whitespace-nowrap">{label}</div>
        </div>
        <div
          className={cn(
            "mt-1 flex items-center justify-center rounded-xl border px-3 font-semibold shadow-inner",
            "dark:shadow-black/20",
            toneClass,
            // sin contorno extra (mockup no lo tiene)
            size === "lg" ? "h-12 text-sm" : "h-10 text-xs",
          )}
        >
          <div
            className={cn(
              "w-full text-center tabular-nums leading-none",
              isEmpty && "text-zinc-400 dark:text-zinc-500",
              tone === "emphasis"
                ? !isEmpty
                  ? "text-sm font-black"
                  : ""
                : size === "lg"
                  ? "text-[12px] font-semibold sm:text-[13px]"
                  : "text-[10px] font-semibold sm:text-[11px]",
            )}
          >
            {isEmpty ? " " : showValue}
          </div>
        </div>
      </div>
    );
  }

  const reportPayload = (note.values as any)?._report?.payload ?? null;
  const reportFields = reportPayload?.fields ?? null;
  const feeMethodRaw = pickField(reportFields, ["feePaymentMethod", "fee_payment_method"]);
  const checkMethodRaw = pickField(reportFields, ["checkPaymentMethod", "check_payment_method"]);

  const checkFeeStatus = statusFromPaymentMethod(feeMethodRaw, { allowRedeposited: true });
  const checkAmountStatus = statusFromPaymentMethod(checkMethodRaw, { allowRedeposited: true });

  // Reacción visual del total: $0.00 => Pending (rojo), >0 => verde.
  const totalDueCents = getTotalDueCentsFromValues(note.values);
  const totalDueText = formatUsd(totalDueCents);
  // Regla: si el caso sigue "Pending" (fee o check), el total se ve rojo aunque haya monto.
  const anyPending =
    checkFeeStatus.text === "Pending" ||
    checkAmountStatus.text === "Pending" ||
    totalDueCents <= 0;
  const totalDueStatus: { tone: "pending" | "paid" } = anyPending
    ? { tone: "pending" }
    : { tone: "paid" };

  return (
    <div
      className={cn(
        "animate-card-in group relative flex h-full flex-col overflow-hidden rounded-3xl border transition-[transform,box-shadow] duration-200 ease-out",
        // light
        "border-zinc-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.13)]",
        // dark
        "dark:border-white/[0.06] dark:bg-[#0f1117]",
        anyPending
          ? "dark:shadow-[0_4px_32px_rgba(239,68,68,0.06)]"
          : "dark:shadow-[0_4px_32px_rgba(16,185,129,0.07)]",
        busy && "pointer-events-none opacity-50",
      )}
    >
      {/* Accent top bar */}
      <div className={cn(
        "h-[3px] w-full shrink-0",
        anyPending
          ? "bg-gradient-to-r from-red-400 via-rose-500 to-orange-400"
          : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400",
      )} />

      {/* Dark glow overlay */}
      <div className={cn(
        "pointer-events-none absolute inset-0 opacity-0 dark:opacity-100",
        anyPending
          ? "bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(239,68,68,0.05),transparent)]"
          : "bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(16,185,129,0.05),transparent)]",
      )} />

      <div className="relative flex flex-1 flex-col p-4 sm:p-5">
        {/* Select checkbox */}
        {selectMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
            className={cn(
              "absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition",
              selected
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10",
            )}
            aria-pressed={selected}
          >
            {selected ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-3.5 w-3.5 rounded-full border border-current/50" />}
          </button>
        ) : null}

        {/* Actions button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onActions(); }}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/60 bg-white/80 text-zinc-500 transition hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-zinc-400 dark:hover:bg-white/[0.10]"
          title="Acciones"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {/* Company name (editable) */}
        <input
          ref={companyNameInputRef}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Nombre de la compañía…"
          className={cn(
            "mb-3 w-full bg-transparent px-2 text-center text-base font-black uppercase tracking-tight outline-none sm:mb-4 sm:text-lg md:text-xl",
            "text-zinc-900 placeholder:text-zinc-400 focus:text-zinc-900",
            "dark:text-white dark:placeholder:text-zinc-600 dark:focus:text-white",
            "rounded-xl border border-transparent transition focus:border-white/10 focus:bg-white/[0.04]",
          )}
        />

        {/* Total Due */}
        <div className={cn(
          "mb-4 flex items-center justify-between rounded-2xl px-4 py-3",
          anyPending
            ? "bg-red-50 dark:bg-red-500/[0.07] dark:ring-1 dark:ring-red-500/15"
            : "bg-emerald-50 dark:bg-emerald-500/[0.07] dark:ring-1 dark:ring-emerald-500/15",
        )}>
          <span className={cn(
            "text-[9px] font-black uppercase tracking-[0.15em]",
            anyPending ? "text-red-500" : "text-emerald-600 dark:text-emerald-500",
          )}>
            Total Due with Fees
          </span>
          <span
            className={cn(
              "text-xl font-black tabular-nums",
              anyPending ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300",
            )}
            style={anyPending
              ? { textShadow: "0 0 20px rgba(239,68,68,0.2)" }
              : { textShadow: "0 0 20px rgba(16,185,129,0.2)" }
            }
          >
            {totalDueText}
          </span>
        </div>

        {/* Cover image — fills remaining space */}
        <div className="flex flex-1 items-stretch">
          {coverUrl ? (
            <button
              type="button"
              onClick={onOpenReport}
              className="group/img relative w-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-zinc-50 shadow-md transition hover:shadow-xl focus:outline-none dark:border-white/[0.06] dark:bg-white/[0.03]"
              style={{ minHeight: "220px" }}
              title="Abrir reporte"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Portada"
                src={coverUrl}
                className="h-full w-full object-cover transition duration-300 group-hover/img:scale-[1.03]"
              />
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/img:opacity-100" />
              {/* Attachments badge */}
              {meta?.total ? (
                <div className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Paperclip className="h-3 w-3" />
                  {meta.total}
                </div>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenReport}
              className="group/report w-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-zinc-50 transition hover:bg-zinc-100 focus:outline-none dark:border-white/[0.05] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
              style={{ minHeight: "220px" }}
              title="Abrir reporte"
            >
              <div className="flex h-full w-full items-center justify-center">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
                  <ImageOff className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Bottom stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Check Amount", status: checkAmountStatus },
            { label: "Check Fee",    status: checkFeeStatus    },
          ].map(({ label, status }) => (
            <div key={label} className={cn(
              "rounded-2xl border px-3 py-2.5 text-center",
              status.tone === "paid"
                ? "border-emerald-100 bg-emerald-50 dark:border-emerald-500/15 dark:bg-emerald-500/[0.07]"
                : "border-red-100 bg-red-50 dark:border-red-500/15 dark:bg-red-500/[0.07]",
            )}>
              <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                {label}
              </p>
              <p className={cn(
                "text-sm font-black",
                status.tone === "paid"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400",
              )}>
                {status.text}
              </p>
            </div>
          ))}
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
  onReportSynced,
  onClose,
}: {
  noteId: string;
  companyTitle: string;
  initialReport: any;
  onLocalReportUpdate: (payload: unknown) => void;
  onReportSynced?: (meta: { updatedAt?: string | null; updatedBy?: any | null }) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const preparedResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [iframeShown, setIframeShown] = useState(false);
  const showFallbackTimerRef = useRef<number | null>(null);
  const flushResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const flushReqRef = useRef<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [initReport, setInitReport] = useState<any>(initialReport);
  const [online, setOnline] = useState<boolean>(() => {
    try {
      return !!navigator.onLine;
    } catch {
      return true;
    }
  });

  const lastPayloadRef = useRef<any>(null);
  const savingRef = useRef(false);

  function sanitizeFilename(name: string) {
    return String(name || "imagen")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 120);
  }

  function sanitizeReportForServer(payload: any) {
    try {
      const imgs = Array.isArray(payload?.images) ? payload.images : [];
      const cleanImgs = imgs
        .map((im: any) => ({
          id: typeof im?.id === "string" ? im.id : "",
          name: typeof im?.name === "string" ? im.name : "Imagen",
          path: typeof im?.path === "string" ? im.path : "",
          createdAt: typeof im?.createdAt === "string" ? im.createdAt : undefined,
        }))
        .filter((im: any) => !!im.id && !!im.path);
      // Keep everything else, but replace images array with path-based entries (no base64, no signed url)
      return { ...(payload ?? {}), images: cleanImgs };
    } catch {
      return payload;
    }
  }

  function postAck(msg: any) {
    try {
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
    } catch {}
  }

  async function postReportPayloadToServer(safePayload: any) {
    const res = await fetch(`/api/notes/${noteId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: safePayload }),
    });
    if (!res.ok) throw new Error("save failed");
    try {
      // Mantener sync local (sin mostrar "última edición" / email).
      const json = await res.json().catch(() => ({}));
      const updatedAt = typeof json?.updatedAt === "string" ? json.updatedAt : null;
      onReportSynced?.({ updatedAt });
    } catch {}
    return;
  }

  async function saveNow(payload: any) {
    if (!payload) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSyncSnapshot({
      online,
      saving: true,
      state: "saving",
      queuedReports: getQueuedReportsCount(),
    });
    try {
      const safePayload = sanitizeReportForServer(payload);
      // Offline => en cola (sin sorpresas)
      if (!online) {
        enqueueReport(noteId, safePayload);
        setSyncSnapshot({
          online: false,
          saving: false,
          state: "queued",
          queuedReports: getQueuedReportsCount(),
        });
        return;
      }
      await postReportPayloadToServer(safePayload);
      removeQueuedReport(noteId);
      setSyncSnapshot({
        online: true,
        saving: false,
        state: "saved",
        queuedReports: getQueuedReportsCount(),
      });
    } catch {
      // Si falla (típicamente red), lo dejamos en cola y se sube al reconectar.
      try {
        const safePayload = sanitizeReportForServer(payload);
        enqueueReport(noteId, safePayload);
      } catch {
        // ignore
      }
      setSyncSnapshot({
        online,
        saving: false,
        state: "queued",
        queuedReports: getQueuedReportsCount(),
      });
    } finally {
      savingRef.current = false;
      setSyncSnapshot({ saving: false, queuedReports: getQueuedReportsCount() });
    }
  }

  function postToIframe(message: unknown) {
    try {
      iframeRef.current?.contentWindow?.postMessage(message, "*");
    } catch {
      // ignore
    }
  }

  async function enrichReportForIframe(payload: any) {
    // The server stores images as {id,name,path} (no signed url).
    // For UI, we need a temporary signed URL to actually display them.
    try {
      const imgs = Array.isArray(payload?.images) ? (payload.images as any[]) : [];
      if (!imgs.length) return payload;
      const supabase = createClient();
      const nextImgs = await Promise.all(
        imgs.map(async (im) => {
          const path = typeof im?.path === "string" ? String(im.path).trim() : "";
          if (!path) return im;
          const hasUrl = typeof im?.url === "string" && String(im.url).trim();
          const hasDataUrl = typeof im?.dataUrl === "string" && String(im.dataUrl).startsWith("data:image/");
          if (hasUrl || hasDataUrl) return im;
          const { data } = await supabase.storage
            .from("attachments")
            .createSignedUrl(path, 60 * 60 * 24); // 24h
          const signedUrl = data?.signedUrl ? String(data.signedUrl) : "";
          return signedUrl ? { ...im, url: signedUrl } : im;
        }),
      );
      return { ...(payload ?? {}), images: nextImgs };
    } catch {
      return payload;
    }
  }

  useEffect(() => {
    // Keep init payload hydrated with signed URLs so reopening shows images immediately.
    let cancelled = false;
    void (async () => {
      // Recovery: si hay algo en cola, eso es lo más nuevo.
      const queued = getQueuedReport(noteId);
      if (queued?.payload) {
        try {
          setSyncSnapshot({ queuedReports: getQueuedReportsCount(), state: "queued" });
          onLocalReportUpdate(queued.payload);
        } catch {}
      }
      const base = queued?.payload ? queued.payload : initialReport;
      const enriched = await enrichReportForIframe(base);
      if (cancelled) return;
      setInitReport(enriched);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

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
      if (data.type === "rc:scrollRestored" && (data as any).noteId === noteId) {
        setIframeShown(true);
        if (showFallbackTimerRef.current) {
          window.clearTimeout(showFallbackTimerRef.current);
          showFallbackTimerRef.current = null;
        }
      }
      if (
        data.type === "rc:flushed" &&
        (data as any).noteId === noteId &&
        flushReqRef.current &&
        (data as any).requestId === flushReqRef.current
      ) {
        // Prefer payload from flush ack (most reliable on quick-close)
        try {
          if ((data as any).payload) lastPayloadRef.current = (data as any).payload;
        } catch {}
        flushResolverRef.current?.(true);
        flushResolverRef.current = null;
        flushReqRef.current = null;
      }
      if (data.type === "rc:save" && data.noteId === noteId) {
        // Always track latest payload so closing can force-save immediately.
        try {
          lastPayloadRef.current = (data as any).payload ?? null;
        } catch {}

        // Update UI immediately (card should reflect total without refresh)
        try {
          onLocalReportUpdate((data as any).payload);
        } catch {}

        // Throttle saves to avoid spamming DB while typing
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(async () => {
          await saveNow((data as any).payload);
        }, 450);
      }

      if (data.type === "rc:uploadImages" && (data as any).noteId === noteId) {
        // Upload report images to Storage + attachments table, then reply with signed URLs.
        void (async () => {
          try {
            const supabase = createClient();
            const {
              data: { user },
              error: userErr,
            } = await supabase.auth.getUser();
            if (userErr || !user) throw new Error("No autenticado");

            const imgs = Array.isArray((data as any).images) ? (data as any).images : [];
            const out: any[] = [];
            for (const im of imgs) {
              const id = typeof im?.id === "string" ? im.id : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
              const nameRaw = typeof im?.name === "string" ? im.name : "imagen.jpg";
              const createdAt = typeof im?.createdAt === "string" ? im.createdAt : new Date().toISOString();
              const dataUrl = typeof im?.dataUrl === "string" ? im.dataUrl : "";
              if (!dataUrl.startsWith("data:image/")) continue;

              const safeName = sanitizeFilename(nameRaw) || "imagen.jpg";
              const uid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
              const path = `${user.id}/${noteId}/${uid}-${safeName.replace(/\.[a-z0-9]+$/i, "")}.jpg`;

              const blob = await fetch(dataUrl).then((r) => r.blob());
              const { error: upErr } = await supabase.storage
                .from("attachments")
                .upload(path, blob, { contentType: "image/jpeg", upsert: false });
              if (upErr) throw upErr;

              const { error: dbErr } = await supabase.from("attachments").insert({
                user_id: user.id,
                note_id: noteId,
                path,
                filename: safeName,
                mime_type: "image/jpeg",
                size: blob.size,
              });
              if (dbErr) throw dbErr;

              const { data: signed, error: signErr } = await supabase.storage
                .from("attachments")
                .createSignedUrl(path, 60 * 60 * 24);
              if (signErr) throw signErr;

              out.push({
                id,
                name: safeName,
                path,
                url: signed?.signedUrl ?? "",
                createdAt,
              });
            }

            postAck({ type: "rc:uploadedImages", noteId, ok: true, images: out });
          } catch (e) {
            postAck({
              type: "rc:uploadedImages",
              noteId,
              ok: false,
              error: e instanceof Error ? e.message : "upload failed",
              images: [],
            });
          }
        })();
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (showFallbackTimerRef.current) window.clearTimeout(showFallbackTimerRef.current);
      if (flushResolverRef.current) flushResolverRef.current(false);
      flushResolverRef.current = null;
      flushReqRef.current = null;
    };
  }, [noteId]);

  // Offline/online status + autosync al reconectar.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setSyncSnapshot({ online: true, queuedReports: getQueuedReportsCount() });
      // Autosync + recovery: si había algo en cola para este note, subimos.
      void (async () => {
        try {
          const queued = getQueuedReport(noteId);
          if (queued?.payload) {
            setSyncSnapshot({ online: true, saving: true, state: "saving" });
            await postReportPayloadToServer(queued.payload);
            removeQueuedReport(noteId);
            setSyncSnapshot({
              online: true,
              saving: false,
              state: "saved",
              queuedReports: getQueuedReportsCount(),
            });
          } else {
            // También intentamos flush global rápido (por si se editó en otra pestaña).
            await flushQueuedReportsOnce({ onlyNoteId: noteId });
          }
        } catch {
          setSyncSnapshot({ state: "queued", queuedReports: getQueuedReportsCount() });
        }
      })();
    };
    const onOffline = () => {
      setOnline(false);
      setSyncSnapshot({ online: false });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function flushAndClose() {
    if (closing) return;
    setClosing(true);
    try {
      // Pedir flush al iframe para que no se pierdan cambios por debounce.
      const reqId =
        (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      flushReqRef.current = reqId;
      const ok = await new Promise<boolean>((resolve) => {
        flushResolverRef.current = resolve;
        try {
          postToIframe({ type: "rc:flushNow", noteId, requestId: reqId });
        } catch {}
        window.setTimeout(() => {
          if (flushResolverRef.current) {
            flushResolverRef.current(false);
            flushResolverRef.current = null;
            flushReqRef.current = null;
          }
        }, 1200);
      });
      void ok;
      // Ensure the last payload is actually saved before unmounting.
      try {
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
      } catch {}
      await saveNow(lastPayloadRef.current);
    } catch {
      // ignore
    } finally {
      onClose();
      setClosing(false);
    }
  }

  useEffect(() => {
    // keep report company name in sync with note title
    postToIframe({ type: "rc:setCompanyName", companyName: companyTitle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyTitle]);

  async function shareReport() {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const reqId = `share-${Date.now()}`;
    const filename = `Returned Checks - ${companyTitle}.pdf`;

    let buffer: ArrayBuffer | null = null;

    try {
      buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMsg);
          reject(new Error("Tiempo de espera"));
        }, 45000);

        function onMsg(ev: MessageEvent) {
          const data: any = ev?.data;
          if (!data || typeof data !== "object") return;
          if (data.type !== "rc:exportPdfResult") return;
          if (String(data.noteId) !== String(noteId)) return;
          if (data.requestId !== reqId) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMsg);
          if (data.ok && data.buffer) {
            resolve(data.buffer as ArrayBuffer);
          } else {
            reject(new Error(String(data.error || "Error exportando PDF")));
          }
        }

        window.addEventListener("message", onMsg);
        try {
          iframe.contentWindow?.postMessage({ type: "rc:exportPdf", noteId, requestId: reqId }, "*");
        } catch (e) {
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMsg);
          reject(e);
        }
      });
    } catch (err) {
      alert(`No se pudo generar el PDF: ${err instanceof Error ? err.message : err}`);
      return;
    }

    if (!buffer) return;

    const blob = new Blob([buffer], { type: "application/pdf" });
    const file = new File([blob], filename, { type: "application/pdf" });

    // Try native share with file (mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: companyTitle });
        return;
      } catch {}
    }

    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-4"
      onClick={() => void flushAndClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[calc(100dvh-16px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900 sm:h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal header: single compact row ── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800 sm:px-4">
          {/* Title */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Reporte</p>
            <p className="truncate text-sm font-bold leading-tight text-zinc-900 dark:text-zinc-50">{companyTitle}</p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Compartir */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void shareReport(); }}
              title="Compartir PDF"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>

            {/* Imprimir */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void printFromParent(); }}
              title="Imprimir"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>

            {/* Abrir en pestaña */}
            <a
              href={`/appreporte/index.html?noteId=${encodeURIComponent(noteId)}&companyName=${encodeURIComponent(companyTitle)}&v=${encodeURIComponent(APPREPORTE_V)}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir en pestaña"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>

            {/* Divider */}
            <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

            {/* Cerrar */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void flushAndClose(); }}
              disabled={closing}
              title="Cerrar"
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar</span>
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-zinc-100 dark:bg-zinc-950">
          {!iframeShown ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
                Cargando…
              </div>
            </div>
          ) : null}
          <iframe
            title="Reporte Return Checks"
            ref={iframeRef}
            src={`/appreporte/index.html?noteId=${encodeURIComponent(noteId)}&companyName=${encodeURIComponent(companyTitle)}&v=${encodeURIComponent(APPREPORTE_V)}`}
            className={cn(
              "h-full w-full transition-opacity duration-150",
              iframeShown ? "opacity-100" : "opacity-0",
            )}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
            onLoad={() => {
              try {
                setIframeShown(false);
                // Fallback: si por alguna razón no llega el "scrollRestored",
                // no dejar la pantalla trabada en "Cargando…".
                if (showFallbackTimerRef.current) window.clearTimeout(showFallbackTimerRef.current);
                showFallbackTimerRef.current = window.setTimeout(() => {
                  setIframeShown(true);
                  showFallbackTimerRef.current = null;
                }, 800);
                postToIframe({ type: "rc:init", noteId, initialReport: initReport });
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
  onDeleteCompany,
  onLocalWrite,
}: {
  note: NoteListItem;
  startOnNew: boolean;
  startOnEntryId: string | null;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onPatch: (patch: Partial<NoteListItem>) => void;
  onDeleteCompany: () => void;
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
  const draftDidHydrateRef = useRef(false);

  function draftKey() {
    return `rc:noteDraft:v1:${note.id}`;
  }

  useEffect(() => {
    setCompanyName(note.title ?? "");
    const nextEntries = sortEntriesDesc(toEntryArray(note.values));
    setEntries(nextEntries);
    setSelectedId(nextEntries[0]?.id ?? null);
    setDraftDate(nextEntries[0]?.date ?? isoToday());
    setDraftAgent(nextEntries[0]?.agent ?? "");
    setDraftNote(nextEntries[0]?.note ?? "");

    // Restore draft (so refresh/tab close can continue editing)
    if (!draftDidHydrateRef.current && typeof window !== "undefined") {
      draftDidHydrateRef.current = true;
      try {
        const raw = window.localStorage.getItem(draftKey());
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d.ts === "number" && Date.now() - d.ts < 7 * 24 * 60 * 60 * 1000) {
            if (typeof d.companyName === "string") setCompanyName(d.companyName);
            if (typeof d.selectedId === "string" || d.selectedId === null) setSelectedId(d.selectedId);
            if (typeof d.draftDate === "string") setDraftDate(d.draftDate);
            if (typeof d.draftAgent === "string") setDraftAgent(d.draftAgent);
            if (typeof d.draftNote === "string") setDraftNote(d.draftNote);
          }
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Persist draft continuously
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        draftKey(),
        JSON.stringify({
          ts: Date.now(),
          noteId: note.id,
          companyName,
          selectedId,
          draftDate,
          draftAgent,
          draftNote,
        }),
      );
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, companyName, selectedId, draftDate, draftAgent, draftNote]);

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
      // Clear draft for this note on successful save
      try {
        window.localStorage.removeItem(draftKey());
      } catch {}
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
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[calc(100dvh-16px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900 sm:h-[92dvh]"
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

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:p-4">
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

            <div className="max-h-none space-y-2 pr-1 md:max-h-[55dvh] md:overflow-auto">
              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  Aún no hay notas. Crea la primera con “Nueva”.
                </div>
              ) : (
                entries.map((e) => {
                  const active = e.id === selectedId;
                  const small = (e.note ?? "").replace(/\s+/g, " ").slice(0, 60);
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setSelectedId(e.id);
                        }
                      }}
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
                    </div>
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
                className="min-h-[140px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-zinc-700 sm:min-h-[180px]"
              />
            </label>

            {/* Controles abajo */}
            <div className="sticky bottom-0 -mx-4 mt-4 flex flex-col gap-2 border-t border-zinc-200 bg-white/95 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={saveEntry}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Guardar
              </button>
            </div>

            {/* Adjuntos / Escaneos eliminado (solo se maneja desde el reporte) */}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

