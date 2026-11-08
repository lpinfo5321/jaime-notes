"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import DashboardV2, { DashSettingsButton, type DashCompany } from "@/components/dashboard/DashboardV2";
import { useDashPrefs } from "@/components/dashboard/dashPrefs";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Download,
  ImageOff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { digitsOnly, normCompany } from "@/lib/company";
import ContactsView from "@/components/contacts/ContactsView";
import DocumentsView from "@/components/documents/DocumentsView";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { onCoverError } from "@/lib/coverRetry";
import { noticeOrAlert } from "@/lib/exportNotice";
import {
  NSF_FOLDER_NAME,
  connectNsfFolder,
  isMobileExport,
  OutboxPendingError,
  sendToOneDriveViaPc,
  csvExportName,
  exportPdfName,
  exportRow,
  exportYear,
  nsfFolderLinked,
  rowsToCsv,
  uniqueExportName,
  writeExportFile,
  yearFolderForExport,
} from "@/lib/nsfExport";
import {
  enqueueReport,
  flushQueuedReportsOnce,
  getQueuedReport,
  getQueuedReportsCount,
  removeQueuedReport,
} from "@/lib/reportQueue";
import { setSyncSnapshot } from "@/lib/syncStatus";

import { type Bucket, APPREPORTE_V, isoToday, toEntryArray, sortEntriesDesc, formatUsMmDdYy, parseMoneyToCents, formatUsd, getTotalDueFromValues, normText, pickField, getTotalDueCentsFromValues, isBucket, normalizePaymentToken, statusFromPaymentMethod, getLatestEntry, getLatestEntryDateIso, getLatestEntryDateTime, getLatestAgent, getCheckPaymentStatusText, getPayText, fitTextToSingleLineInput, type Entry } from "./notesUtils";

const ReportModal = dynamic(() => import("./ReportModal"), { ssr: false });
const CompanyNotesModal = dynamic(() => import("./CompanyNotesModal"), { ssr: false });

const DRAFT_TAG = "__draft";

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


type CompanyContact = {
  id: string;
  name: string;
  phones: string[];
  email?: string | null;
  company?: string | null;
};

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
  const [nsfLinked, setNsfLinked] = useState(false);
  useEffect(() => {
    void nsfFolderLinked().then(setNsfLinked);
  }, []);
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
    isNew?: boolean;
  } | null>(null);
  const [creatingReport, setCreatingReport] = useState(false);
  const discardedDraftRef = useRef<string | null>(null);
  const freshCoversRef = useRef(false);
  // Cambia la portada solo si es una imagen distinta (mismo archivo con otro token = no se toca → sin parpadeo).
  function setCoverStable(id: string, url: string) {
    setLocalCoverUrls((prev) => {
      const cur = prev?.[id];
      if (cur === url) return prev;
      if (cur && !url.startsWith("data:") && !cur.startsWith("data:") && cur.split("?")[0] === url.split("?")[0]) return prev;
      return { ...(prev ?? {}), [id]: url };
    });
  }

  // Los reportes "borrador" (recién creados, aún sin guardar) no se muestran en ninguna lista.
  const [itemsRaw, setItems] = useState<NoteListItem[]>(notes);
  const items = useMemo(() => itemsRaw.filter((n) => !(n.tags ?? []).includes(DRAFT_TAG)), [itemsRaw]);
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
    // El server manda URLs firmadas nuevas: tienen prioridad (las viejas pueden estar vencidas).
    // Las URLs firmadas cambian de token en cada recarga: si es la MISMA imagen se conserva la URL actual
    // (así no se vuelve a descargar ni parpadea). Solo se renueva si una portada falló (URL vencida).
    const fresh = freshCoversRef.current;
    freshCoversRef.current = false;
    setLocalCoverUrls((prev) => {
      const p = prev ?? {};
      const next: Record<string, string> = { ...p };
      let changed = false;
      for (const [k, v] of Object.entries(coverUrls ?? {})) {
        const cur = p[k];
        if (!cur) { next[k] = v; changed = true; continue; }
        if (cur.startsWith("blob:") || cur === v) continue;
        if (!fresh && cur.split("?")[0] === v.split("?")[0]) continue;
        if (cur.startsWith("data:") && v.startsWith("data:") && !fresh) continue;
        next[k] = v;
        changed = true;
      }
      return changed ? next : p;
    });
  }, [coverUrls]);

  // Si una portada falla varias veces (URL vencida), pide datos nuevos al servidor (máx. 1 vez / 20 s).
  useEffect(() => {
    let last = 0;
    const h = () => {
      if (Date.now() - last < 20000) return;
      last = Date.now();
      freshCoversRef.current = true;
      router.refresh();
    };
    window.addEventListener("rc:cover-expired", h);
    return () => window.removeEventListener("rc:cover-expired", h);
  }, [router]);

  // Calienta en segundo plano los módulos pesados (reporte y notas) para que abran al instante.
  useEffect(() => {
    const warm = () => { void import("./ReportModal"); void import("./CompanyNotesModal"); };
    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(t);
  }, []);

  // Borradores huérfanos (pestaña cerrada a medias): con contenido se publican, vacíos se eliminan.
  const draftsSweptRef = useRef(false);
  useEffect(() => {
    if (draftsSweptRef.current) return;
    draftsSweptRef.current = true;
    const old = notes.filter(
      (n) => (n.tags ?? []).includes(DRAFT_TAG) && Date.now() - new Date(n.created_at).getTime() > 15 * 60 * 1000,
    );
    for (const n of old) void finalizeDraft(n.id, false);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Se busca también entre los borradores: /app/new crea el reporte como borrador
    // (no aparece en la lista hasta que se guarde con contenido).
    const note = itemsRaw.find((n) => String(n.id) === id) ?? null;
    if (!note) return;

    handledOpenReportRef.current = id;
    setReportForCompany({
      id: note.id,
      title: (note.title ?? "").trim() || "Sin nombre",
      values: (note.values ?? null) as any,
      coverUrl: localCoverUrls?.[note.id] ?? null,
      isNew: (note.tags ?? []).includes(DRAFT_TAG),
    });

    // Limpia el parámetro para que no se vuelva a disparar en refresh
    try {
      const params = new URLSearchParams(sp.toString());
      params.delete("openReport");
      const next = params.toString();
      router.replace(next ? `/app?${next}` : "/app");
    } catch {}
  }, [sp, itemsRaw, localCoverUrls, router]);

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

  // ── Datos siempre al día ───────────────────────────────────────────────
  // ¿Hay alguna ventana abierta o el usuario está escribiendo? Entonces NO refrescamos
  // (para no pisar lo que está escribiendo) y lo dejamos pendiente para cuando termine.
  const anyModalOpen = !!(open || reportForCompany || notesModal || actionsFor);
  const anyModalOpenRef = useRef(false);
  anyModalOpenRef.current = anyModalOpen;
  const pendingRemoteRef = useRef(false);
  pendingRemoteRef.current = pendingRemote;

  function userIsTyping() {
    try {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    } catch {
      return false;
    }
  }

  // Pide los datos frescos al servidor (respeta ventanas abiertas / escritura en curso).
  const requestRefreshRef = useRef<(opts?: { force?: boolean }) => void>(() => {});
  requestRefreshRef.current = (opts) => {
    if (!opts?.force && Date.now() < suppressRemoteUntilRef.current) return;
    if (anyModalOpenRef.current || userIsTyping()) {
      setPendingRemote(true);
      return;
    }
    router.refresh();
  };

  // Realtime cross-device updates (Supabase Realtime).
  // Se suscribe UNA sola vez (antes se re-suscribía cada vez que se abría/cerraba una nota
  // y podía perder eventos justo en ese momento).
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
          () => requestRefreshRef.current(),
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
            requestRefreshRef.current();
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
  }, [router]);

  // Respaldo: al volver a la app (celular/PWA), al recuperar internet y cada 90 s
  // se vuelven a pedir los datos, por si el tiempo real se cortó mientras estaba en segundo plano.
  useLiveRefresh(() => requestRefreshRef.current(), { pollMs: 90_000, minGapMs: 3000 });

  // Si había un refresco pendiente (ventana abierta / escribiendo), hazlo al terminar.
  useEffect(() => {
    if (!anyModalOpen && pendingRemote && !userIsTyping()) {
      setPendingRemote(false);
      router.refresh();
    }
  }, [anyModalOpen, pendingRemote, router]);
  useEffect(() => {
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (pendingRemoteRef.current && !anyModalOpenRef.current && !userIsTyping()) {
          setPendingRemote(false);
          router.refresh();
        }
      }, 250);
    };
    window.addEventListener("focusout", onFocusOut);
    return () => window.removeEventListener("focusout", onFocusOut);
  }, [router]);

  // Tras cerrar una ventana de edición, re-sincroniza con el servidor (la fuente de verdad)
  // para que lo que se ve siempre coincida con lo guardado.
  function resyncSoon() {
    window.setTimeout(() => requestRefreshRef.current({ force: true }), 700);
  }

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

  // Precarga (en segundo plano) los archivos del editor de reportes: al abrir un reporte ya están en el dispositivo.
  useEffect(() => {
    const warm = () => {
      for (const u of [`/appreporte/app.js?v=${encodeURIComponent(APPREPORTE_V)}`, "/appreporte/lp-logo.png"]) {
        fetch(u).catch(() => {});
      }
    };
    const w = window as any;
    const id = w.requestIdleCallback ? w.requestIdleCallback(warm, { timeout: 4000 }) : window.setTimeout(warm, 2500);
    return () => { try { w.cancelIdleCallback ? w.cancelIdleCallback(id) : window.clearTimeout(id); } catch {} };
  }, []);

  // ── Contactos (clientes/teléfonos) ligados a compañías por nombre ──
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  async function loadContacts() {
    try {
      const r = await fetch("/api/contacts", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setContacts(Array.isArray(j?.contacts) ? j.contacts : []);
    } catch {}
  }
  useEffect(() => { void loadContacts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(() => { void loadContacts(); }, { table: "contacts", pollMs: 120_000, minGapMs: 5000 });

  // Compañías que coinciden con la búsqueda por ser el cliente / teléfono / correo de un contacto
  const contactMatchedCompanies = useMemo(() => {
    const set = new Set<string>();
    const raw = filterAgent.trim();
    const qBy = (sp.get("qBy") ?? "company").trim() || "company";
    if (!raw || qBy !== "company") return set;
    const q = normCompany(raw);
    const qd = digitsOnly(raw);
    for (const c of contacts) {
      const co = normCompany(c.company);
      if (!co) continue;
      const textHit =
        normCompany(c.name).includes(q) ||
        normCompany(c.email).includes(q) ||
        co.includes(q);
      const phoneHit = qd.length >= 3 && (c.phones ?? []).some((ph) => digitsOnly(ph).includes(qd));
      if (textHit || phoneHit) set.add(co);
    }
    return set;
  }, [contacts, filterAgent, sp]);

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
          const titleN = normCompany(n.title);
          const hit = titleN.includes(normCompany(q)) || contactMatchedCompanies.has(titleN);
          if (!hit) return false;
        }
      }
      if (filterStatus) {
        const s = getCheckPaymentStatusText(n.values);
        if (s !== filterStatus) return false;
      }
      return true;
    });
    return pass;
  }, [baseBucket, filterAgent, filterStatus, sp, contactMatchedCompanies]);

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

  // Datos para el dashboard con estilo (carpetas + notas)
  const dashPrefs = useDashPrefs();
  const dashCompanies = useMemo<DashCompany[]>(() => {
    if (dashPrefs.design === 0) return [];
    const fmtDay = (iso: string) => (iso ? formatUsMmDdYy(iso) : "—");
    return companyGroups.map((g) => {
      const sheets = g.notes.slice(0, 3).map((n) => {
        const ent = sortEntriesDesc(toEntryArray(n.values))[0];
        return {
          id: n.id,
          no: n.id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase(),
          amount: formatUsd(getTotalDueCentsFromValues(n.values)),
          date: fmtDay(ent?.date ?? (n.updated_at ?? "").slice(0, 10)),
          paid: deriveBucketFromNote(n) === "completed",
          agent: (ent?.agent ?? "").trim(),
          cover: localCoverUrls[n.id] ?? coverUrls[n.id] ?? null,
        };
      });
      const recent = g.notes
        .flatMap((n) => toEntryArray(n.values))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 3)
        .map((e) => ({ text: e.note.replace(/\s+/g, " ").trim().slice(0, 90), date: e.date, agent: e.agent }))
        .filter((e) => e.text);
      return {
        name: g.name,
        init: g.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
        totalDueCents: g.totalDueCents,
        due: formatUsd(g.totalDueCents),
        pendingCount: g.pendingCount,
        completedCount: g.completedCount,
        checkCount: g.notes.length,
        lastDate: g.lastActivity ? new Date(g.lastActivity).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : "—",
        entryDate: g.latestEntryDate ? formatUsMmDdYy(g.latestEntryDate) : "",
        entryAgent: g.latestEntryAgent,
        entryText: g.latestEntryText,
        sheets,
        recent,
      };
    });
  }, [companyGroups, dashPrefs.design, localCoverUrls, coverUrls]); // eslint-disable-line react-hooks/exhaustive-deps
  const useNewDash = dashPrefs.design !== 0 && !selectedCompany;
  // Notes visible when drilled into a specific company
  // Reportes que se renombraron estando dentro de la compañía: se quedan visibles en la pantalla
  // (antes la tarjeta "desaparecía" a mitad de escribir porque ya no coincidía con el nombre).
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => { setPinnedIds(new Set()); }, [selectedCompany]);
  const pinNote = (id: string) => setPinnedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const visibleForCompany = useMemo(() => {
    if (!selectedCompany) return visible;
    return visible.filter(
      (n) => ((n.title ?? "").trim() || "Sin nombre") === selectedCompany || pinnedIds.has(n.id),
    );
  }, [visible, selectedCompany, pinnedIds]);

  // Agrega un reporte NUEVO dentro de una compañía que ya existe (mismo nombre => misma compañía).
  async function addReportToCompany(companyName: string) {
    if (creatingReport) return;
    setCreatingReport(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: companyName, body: "", tags: [DRAFT_TAG], favorite: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) throw new Error(json?.error || "No se pudo crear el reporte");
      const nowIso = new Date().toISOString();
      const id = String(json.id);
      // Se abre al instante (sin recargar la página) y no aparece en la lista hasta que tenga contenido.
      setReportForCompany({ id, title: companyName, values: null, coverUrl: null, isNew: true });
      setItems((prev) => [
        { id, title: companyName, body: "", tags: [DRAFT_TAG], favorite: false, values: null, updated_at: nowIso, created_at: nowIso },
        ...prev,
      ]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error creando el reporte");
    } finally {
      setCreatingReport(false);
    }
  }

  // Si se cancela un reporte NUEVO sin haber escrito nada, se elimina (no queda un reporte vacío).
  // Se ignoran los campos que la app llena sola (nombre, maker/payor, cuota y total).
  function reportHasContent(p: any): boolean {
    if (!p) return false;
    if (Array.isArray(p.images) && p.images.length) return true;
    const fields = (p.fields ?? {}) as Record<string, unknown>;
    for (const [k, val] of Object.entries(fields)) {
      if (/^(company_?name|maker_?payor|total_?due|returned_?fee)$/i.test(k)) continue;
      if (typeof val === "string") {
        const t = val.trim();
        if (t && t.toUpperCase() !== "RELLENAR" && t !== "$0.00") return true;
      } else if (val && typeof val === "object") {
        if (Array.isArray(val) ? val.length : Object.keys(val as object).length) return true;
      } else if (val === true) return true;
    }
    return false;
  }

  // Al cerrar un reporte NUEVO: si el usuario descartó o no escribió nada → se elimina por completo;
  // si hay contenido → se "publica" (deja de ser borrador y aparece en la lista).
  async function finalizeDraft(noteId: string, forceDelete: boolean) {
    const removeLocal = () => setItems((prev) => prev.filter((n) => n.id !== noteId));
    const publish = async () => {
      setItems((prev) => prev.map((n) => (n.id === noteId ? { ...n, tags: (n.tags ?? []).filter((t) => t !== DRAFT_TAG) } : n)));
      try {
        await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tags: [] }),
        });
      } catch {}
    };
    try {
      if (forceDelete) {
        removeQueuedReport(noteId);
        const del = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        if (del.ok) removeLocal();
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) return void (await publish());
      const queued = getQueuedReport(noteId);
      if (queued?.payload && reportHasContent(queued.payload)) return void (await publish());
      const supabase = createClient();
      const { data: row, error } = await supabase.from("notes").select("values,body").eq("id", noteId).single();
      if (error || !row) return void (await publish());
      const { count } = await supabase.from("attachments").select("id", { count: "exact", head: true }).eq("note_id", noteId);
      const v = ((row.values ?? {}) as Record<string, any>) ?? {};
      const hasContent =
        (count ?? 0) > 0 ||
        (Array.isArray(v._entries) && v._entries.length > 0) ||
        !!String(row.body ?? "").trim() ||
        reportHasContent(v._report?.payload);
      if (hasContent) return void (await publish());
      const del = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      if (del.ok) {
        removeQueuedReport(noteId);
        removeLocal();
      } else await publish();
    } catch {
      await publish(); // ante cualquier duda NO se pierde nada
    }
  }

  // Renombra TODA la compañía (todos sus reportes, en cualquier pestaña) de una vez.
  async function renameCompany(oldName: string, newNameRaw: string) {
    let newName = newNameRaw.trim();
    if (!newName || newName === oldName) return;
    // ¿Ya existe otra compañía con ese nombre? Entonces se unen (misma compañía, un solo lugar).
    const clash = items.find(
      (n) => ((n.title ?? "").trim() || "Sin nombre") !== oldName && normCompany(n.title) === normCompany(newName),
    );
    if (clash) {
      const target = (clash.title ?? "").trim();
      const ok = window.confirm(
        `Ya existe la compañía "${target}".\n\n¿Unir los reportes de "${oldName}" dentro de "${target}"?`,
      );
      if (!ok) return;
      newName = target;
    }
    const targets = items.filter((n) => ((n.title ?? "").trim() || "Sin nombre") === oldName);
    if (!targets.length) return;
    const ids = new Set(targets.map((t) => t.id));
    const prevTitles = new Map(targets.map((t) => [t.id, t.title] as const));
    suppressRemoteUntilRef.current = Date.now() + 4000;
    setItems((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, title: newName } : n)));
    setSelectedCompany(newName);
    const results = await Promise.all(
      targets.map((t) =>
        fetch(`/api/notes/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: newName }),
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    const failed = targets.filter((_, i) => !results[i]);
    if (failed.length) {
      const failedIds = new Set(failed.map((f) => f.id));
      setItems((prev) => prev.map((n) => (failedIds.has(n.id) ? { ...n, title: prevTitles.get(n.id) ?? n.title } : n)));
      alert(`No se pudo renombrar ${failed.length} reporte(s). Revisa tu conexión e inténtalo de nuevo.`);
    }
    resyncSoon();
  }

  // Renombra un solo reporte (lo usa el reporte cuando se edita su "Company Name").
  async function renameSingleNote(noteId: string, newNameRaw: string) {
    const newName = newNameRaw.trim();
    if (!newName) return;
    const note = items.find((n) => n.id === noteId);
    if (!note) return;
    if ((note.title ?? "").trim().toLowerCase() === newName.toLowerCase()) return;
    const prevTitle = note.title;
    suppressRemoteUntilRef.current = Date.now() + 3000;
    pinNote(noteId);
    patchCompany(noteId, { title: newName });
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newName }),
      });
      if (!res.ok) throw new Error("rename failed");
    } catch {
      patchCompany(noteId, { title: prevTitle });
    }
  }

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
      { id: "pending",   label: "Pendientes",  icon: <Archive      className="h-4 w-4 shrink-0" /> },
      { id: "completed", label: "Completados", icon: <CheckCircle2 className="h-4 w-4 shrink-0" /> },
      { id: "trash",     label: "Papelera",    icon: <Trash2       className="h-4 w-4 shrink-0" /> },
    ];
    return (
      <div data-bar="buckets" className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 pointer-events-none">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/85"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)" }}
        >
          {tabs.map((t) => {
            const active = bucket === t.id;
            const count  = bucketCounts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setBucket(t.id)}
                className={cn(
                  "relative flex items-center rounded-xl py-2 font-bold text-xs transition-all duration-300 ease-out",
                  active
                    ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900 px-3 gap-1.5"
                    : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 px-2.5 gap-0",
                )}
                style={{ overflow: "hidden" }}
              >
                {t.icon}

                {/* Label — only visible when active, slides in */}
                <span
                  style={{
                    maxWidth: active ? "100px" : "0px",
                    opacity: active ? 1 : 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    transition: "max-width 0.3s cubic-bezier(0.34,1.2,0.64,1), opacity 0.25s ease",
                    display: "inline-block",
                  }}
                >
                  {t.label}
                </span>

                {/* Count badge — only when active and count > 0 */}
                {active && count > 0 && (
                  <span
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: "999px",
                      padding: "1px 6px",
                      fontSize: "10px",
                      fontWeight: 900,
                      lineHeight: 1.4,
                      animation: "scale-in .2s cubic-bezier(.34,1.56,.64,1) both",
                    }}
                    className="dark:bg-black/20"
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
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

  function rowFor(n: NoteListItem) {
    const payload = (n.values as any)?._report?.payload ?? null;
    return exportRow({
      company: (n.title ?? "").trim(),
      fields: payload?.fields ?? null,
      bucket: deriveBucketFromNote(n),
      createdAt: n.created_at,
      latestDate: getLatestEntry(n.values)?.date ?? "",
    });
  }

  async function destinationYearDir() {
    if (isMobileExport()) return null;
    let dir = await yearFolderForExport();
    if (dir) return dir;
    const ok = await connectNsfFolder();
    if (!ok) return null;
    setNsfLinked(true);
    return yearFolderForExport();
  }

  async function exportSelectedPdfsZip() {
    const ids = selectedInBucket;
    if (!ids.length) return;

    setBulkBusy(true);
    const notice = await noticeOrAlert();
    notice.start("Exportando…", `0 de ${ids.length}`);
    try {
      const dir = await destinationYearDir();
      notice.start("Exportando…", `0 de ${ids.length}`);
      const { default: JSZip } = await import("jszip");

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

      const used = new Set<string>();
      const loose: { filename: string; buffer: ArrayBuffer }[] = [];

      // Uno por uno para no cargar todos los PDF en memoria a la vez.
      let n = 0;
      for (const id of ids) {
        notice.update("Exportando…", `${n} de ${ids.length}`);
        n += 1;
        const note = items.find((n) => String(n.id) === String(id)) ?? null;
        const { buffer } = await exportOne(String(id));
        const filename = uniqueExportName(used, note ? exportPdfName(rowFor(note)) : `cheque-${id}.pdf`);
        loose.push({ filename, buffer });
      }

      if (dir) {
        const failed: { filename: string; buffer: ArrayBuffer }[] = [];
        let lastErr = "";
        let w = 0;
        for (const file of loose) {
          notice.update("Guardando en OneDrive…", `${w} de ${loose.length}`);
          w += 1;
          try {
            await writeExportFile(dir, file.filename, new Blob([file.buffer], { type: "application/pdf" }));
          } catch (e) {
            lastErr = e instanceof Error ? e.message : "";
            failed.push(file);
          }
        }
        const year = exportYear();
        const saved = loose.length - failed.length;
        if (failed.length) {
          const z = new JSZip();
          for (const file of failed) z.file(file.filename, file.buffer);
          downloadBlob(`PDFs-${year}.zip`, await z.generateAsync({ type: "blob" }));
          notice.error(
            `NO se guardaron ${failed.length} de ${loose.length} PDF`,
            `${saved > 0 ? `Sí se guardaron ${saved}. ` : ""}Los ${failed.length} que fallaron se descargaron en un ZIP. ${lastErr}`,
          );
        } else {
          notice.success(`${saved} PDF exportado${saved === 1 ? "" : "s"}`, `${NSF_FOLDER_NAME}\\${year}`);
        }
        return;
      }

      const z = new JSZip();
      for (const file of loose) z.file(file.filename, file.buffer);
      if (isMobileExport()) {
        let savedN = 0;
        let waiting = false;
        for (const file of loose) {
          notice.update("Exportando…", `${savedN} de ${loose.length}`);
          try {
            await sendToOneDriveViaPc(file.filename, new Blob([file.buffer], { type: "application/pdf" }), (msg) => notice.update("Exportando…", msg), waiting ? 0 : 28000);
            savedN += 1;
          } catch (e) {
            if (e instanceof OutboxPendingError) {
              waiting = true;
              continue;
            }
            throw e;
          }
        }
        if (waiting) {
          notice.error(
            "TODAVÍA NO están todos en OneDrive",
            `${savedN} de ${loose.length} quedaron confirmados en la carpeta. El resto quedó en espera y se guardará cuando enciendas la computadora. Hasta entonces no los tomes como guardados.`,
          );
        } else {
          notice.success(`${savedN} PDF exportado${savedN === 1 ? "" : "s"}`, `${NSF_FOLDER_NAME}\\${exportYear()}`);
        }
        return;
      }
      downloadBlob(`PDFs-${exportYear()}.zip`, await z.generateAsync({ type: "blob" }));
      notice.error("NO se guardó en OneDrive", "No hay carpeta de OneDrive conectada. Los PDF se descargaron en un ZIP.");
    } catch (e) {
      notice.error("NO se exportó", e instanceof Error ? e.message : "Error exportando PDFs");
    } finally {
      setBulkBusy(false);
    }
  }

  async function exportSelectedCsv() {
    const ids = selectedInBucket;
    if (!ids.length) return;
    const notice = await noticeOrAlert();
    notice.start("Exportando…", "Preparando la lista");
    try {
      const idSet = new Set(ids.map(String));
      const rows = items.filter((n) => idSet.has(String(n.id))).map((n) => rowFor(n));
      const csv = rowsToCsv(rows);
      const filename = csvExportName();
      const dir = await destinationYearDir();
      notice.start("Exportando…", "Guardando en OneDrive");
      if (dir) {
        try {
          await writeExportFile(dir, filename, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
          notice.success("Exportado a OneDrive", `${NSF_FOLDER_NAME}\\${exportYear()}\\${filename}`);
          return;
        } catch (e) {
          downloadText(filename, csv, "text/csv");
          notice.error("NO se guardó en OneDrive", `${e instanceof Error ? e.message : ""} Se descargó el archivo en esta computadora.`);
          return;
        }
      }
      if (isMobileExport()) {
        try {
          const csvBlob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
          const saved = await sendToOneDriveViaPc(filename, csvBlob, (msg) => notice.update("Exportando…", msg));
          notice.success("Exportado a OneDrive", saved.file);
        } catch (e) {
          if (e instanceof OutboxPendingError) {
            notice.error(
              "TODAVÍA NO está en OneDrive",
              "Tu computadora está apagada o el ayudante no está activo. La lista quedó en espera y se guardará en la carpeta del año cuando la enciendas.",
            );
          } else {
            downloadText(filename, csv, "text/csv");
            notice.error("NO se guardó en OneDrive", `${e instanceof Error ? e.message : ""} Se descargó el archivo en este celular.`);
          }
        }
        return;
      }
      downloadText(filename, csv, "text/csv");
      notice.error("NO se guardó en OneDrive", "No hay carpeta de OneDrive conectada. Se descargó el archivo en esta computadora.");
    } catch (e) {
      notice.error("NO se exportó", e instanceof Error ? e.message : "No se pudo exportar");
    }
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
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() =>
                void (async () => {
                  const ok = await connectNsfFolder();
                  if (!ok) return;
                  setNsfLinked(true);
                  alert(`Listo. A partir de ahora se guarda en:\n${NSF_FOLDER_NAME}\\${exportYear()}`);
                })()
              }
              disabled={bulkBusy}
              title="Elige la carpeta NSF CHECKS PDF FILES. La app crea sola la carpeta del año."
            >
              {nsfLinked ? "OneDrive listo" : "Carpeta OneDrive"}
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void exportSelectedCsv()}
              disabled={bulkBusy || selectedCount === 0}
              title="Fecha, Pagado, Compañía y # de cheque"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void exportSelectedPdfsZip()}
              disabled={bulkBusy || selectedCount === 0}
              title="Guarda cada PDF suelto en la carpeta del año"
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
    <div className={selectedCompany ? "w-full pb-24" : "mx-auto w-full max-w-7xl pb-24"}>

      {/* ── DASHBOARD: tarjetas agrupadas por compañía ── */}
      {dashPrefs.design === 0 && !selectedCompany ? <DashSettingsButton /> : null}
      {useNewDash ? (
        <DashboardV2
          companies={dashCompanies}
          bucket={bucket}
          counts={bucketCounts}
          onBucket={setBucket}
          onOpenCompany={(name) => setSelectedCompany(name)}
          onOpenNotes={(name) => {
            const g = companyGroups.find((x) => x.name === name);
            if (g) setNotesModal({ name, notes: g.notes });
          }}
          onQuickAdd={(name) => {
            const g = companyGroups.find((x) => x.name === name);
            if (g) setNotesModal({ name, notes: g.notes, startInNew: true });
          }}
          onNew={() => router.push("/app/new")}
          onContacts={() => setShowContacts(true)}
        />
      ) : !selectedCompany ? (
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
        <div className="co-detail">
          <div className="co-hero">
            <section className="co-folder">
              <div className="co-folder-top">
                <button
                  type="button"
                  onClick={() => setSelectedCompany(null)}
                  className="co-back"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                  Dashboard
                </button>
                <span className="co-count">
                  {visibleForCompany.length} {visibleForCompany.length === 1 ? "reporte" : "reportes"}
                </span>
              </div>
              <CompanyTitleEditor name={selectedCompany} onRename={(n) => renameCompany(selectedCompany, n)} />
              <div className="co-folder-due">
                <small>Total due with fees</small>
                <b>{formatUsd(visibleForCompany.reduce((sum, n) => sum + getTotalDueCentsFromValues(n.values), 0))}</b>
              </div>
            </section>
            <aside className="co-note">
              <CompanyContactsPanel
                companyName={selectedCompany}
                contacts={contacts}
                onChanged={() => void loadContacts()}
                onNewReport={() => void addReportToCompany(selectedCompany)}
              />
            </aside>
          </div>

          <div className="report-grid">
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
                onPatch={(patch) => {
                  if (patch.title !== undefined) pinNote(note.id);
                  patchCompany(note.id, patch);
                }}
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
            onClose={() => { setOpen(null); resyncSoon(); }}
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

      {creatingReport ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-zinc-800 shadow-xl">Creando reporte…</div>
        </div>
      ) : null}

      {reportForCompany ? (
        <ReportModal
          noteId={reportForCompany.id}
          companyTitle={reportForCompany.title}
          onCompanyNameChange={(name) => void renameSingleNote(reportForCompany.id, name)}
          onDiscarded={() => { discardedDraftRef.current = reportForCompany.id; }}
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
                setCoverStable(reportForCompany.id, nextCover);
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
                      setCoverStable(reportForCompany.id, signedUrl);
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
            const wasNew = !!reportForCompany.isNew;
            setReportForCompany(null);
            if (shouldSuggestMoveToCompleted(noteId, values)) {
              setConfirmMoveComplete({ id: noteId, title });
            }
            if (wasNew) {
              const forced = discardedDraftRef.current === noteId;
              discardedDraftRef.current = null;
              void finalizeDraft(noteId, forced).finally(() => resyncSoon());
            }
            else resyncSoon();
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
          onClose={() => { setNotesModal(null); resyncSoon(); }}
        />
      ) : null}

      <MultiSelectBar />
      {useNewDash ? null : <BucketBar />}
    </div>
  );
}


/** Contactos (clientes / teléfonos) de una compañía + botón para agregar reporte nuevo dentro de ella. */
function CompanyContactsPanel({
  companyName,
  contacts,
  onChanged,
  onNewReport,
}: {
  companyName: string;
  contacts: CompanyContact[];
  onChanged: () => void;
  onNewReport: () => void;
}) {
  const mine = useMemo(
    () => contacts.filter((c) => normCompany(c.company) === normCompany(companyName)),
    [contacts, companyName],
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const dirty = adding && (name.trim() || phone.trim() || email.trim());
  function reset() {
    setAdding(false);
    setConfirm(false);
    setName("");
    setPhone("");
    setEmail("");
  }
  function cancel() {
    if (saving) return;
    if (dirty) setConfirm(true);
    else reset();
  }
  async function save(): Promise<void> {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phones: phone.trim() ? [phone.trim()] : [],
          email: email.trim(),
          company: companyName,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "No se pudo guardar el contacto");
      }
      reset();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando el contacto");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

  return (
    <div className="co-contacts mb-5 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Contactos de esta compañía
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {mine.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => (adding ? cancel() : setAdding(true))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? "Cerrar" : "Contacto"}
        </button>
        <button
          type="button"
          onClick={onNewReport}
          className="co-primary inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo reporte aquí
        </button>
      </div>

      {mine.length === 0 && !adding ? (
        <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">
          Aún no hay contactos de esta compañía. Agrega el teléfono del cliente para encontrarla buscando por número.
        </p>
      ) : null}

      {mine.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {mine.map((c) => (
            <li key={c.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm font-bold text-zinc-900 dark:text-white">{c.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                {(c.phones ?? []).filter(Boolean).map((ph) => (
                  <a key={ph} href={`tel:${ph}`} className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline dark:text-sky-300">
                    <Phone className="h-3 w-3" />
                    {ph}
                  </a>
                ))}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="truncate text-zinc-500 hover:underline dark:text-zinc-400">
                    {c.email}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente *" className={inputCls} autoFocus />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" inputMode="tel" className={inputCls} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)" inputMode="email" className={inputCls} />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Cancelar
            </button>
            <button type="button" onClick={() => void save()} disabled={!name.trim() || saving} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
              {saving ? "Guardando…" : "Guardar contacto"}
            </button>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <UnsavedChangesDialog
          title="¿Guardar este contacto?"
          message="Escribiste datos de un contacto que todavía no se han guardado."
          saveLabel="Guardar contacto"
          canSave={!!name.trim()}
          cantSaveHint="Para guardar, escribe el nombre del cliente."
          saving={saving}
          onSave={save}
          onDiscard={reset}
          onKeepEditing={() => setConfirm(false)}
        />
      ) : null}
    </div>
  );
}

/** Título de la compañía (pantalla de detalle) con botón para renombrarla. Pregunta antes de perder cambios. */
function CompanyTitleEditor({
  name,
  onRename,
}: {
  name: string;
  onRename: (next: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const dirty = editing && draft.trim() !== name.trim();

  async function save() {
    const v = draft.trim();
    if (!v) return;
    setSaving(true);
    try {
      await onRename(v);
    } finally {
      setSaving(false);
      setConfirm(false);
      setEditing(false);
    }
  }
  function leave() {
    setConfirm(false);
    setDraft(name);
    setEditing(false);
  }
  function requestLeave() {
    if (saving) return;
    if (confirm) { setConfirm(false); inputRef.current?.focus(); return; }
    if (dirty) setConfirm(true);
    else leave();
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-xl font-extrabold uppercase tracking-tight text-zinc-900 dark:text-white">{name}</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Renombrar compañía (todos sus reportes)"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-bold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Renombrar</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          if (e.key === "Escape") { e.preventDefault(); requestLeave(); }
        }}
        onBlur={() => { if (!confirm && !saving) requestLeave(); }}
        className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-base font-black uppercase tracking-tight text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void save()}
        disabled={saving || !draft.trim()}
        className="h-10 shrink-0 rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
      {confirm ? (
        <UnsavedChangesDialog
          title="¿Guardar el nuevo nombre?"
          message={`Vas a cambiar "${name}" por "${draft.trim()}" en todos sus reportes.`}
          saveLabel="Guardar nombre"
          canSave={!!draft.trim()}
          cantSaveHint="El nombre no puede quedar vacío."
          saving={saving}
          onSave={save}
          onDiscard={leave}
          onKeepEditing={() => { setConfirm(false); inputRef.current?.focus(); }}
        />
      ) : null}
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
  const modernCard = true;
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

  const checkNo = normText(pickField(reportFields, ["checkNumber", "check_number"])).replace(/^#/, "");
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

  if (modernCard) {
    return (
      <article className={cn("report-shot", busy && "is-busy")}>
        <div className="report-shot-img">
          {coverUrl ? (
            <button type="button" onClick={onOpenReport} title="Abrir reporte">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Reporte" src={coverUrl} loading="lazy" decoding="async" onError={onCoverError} />
            </button>
          ) : (
            <button type="button" className="report-shot-empty" onClick={onOpenReport} title="Abrir reporte">
              <ImageOff className="h-8 w-8" />
            </button>
          )}
          {selectMode ? (
            <button
              type="button"
              className={cn("report-shot-check", selected && "on")}
              onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
              aria-pressed={selected}
            >
              {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
            </button>
          ) : null}
          <button type="button" className="report-shot-more" onClick={(e) => { e.stopPropagation(); onActions(); }} title="Acciones" aria-label="Acciones">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {meta?.total ? (
            <span className="report-shot-clip"><Paperclip className="h-3 w-3" /> {meta.total}</span>
          ) : null}
        </div>
        <div className="report-shot-foot">
          <div>
            <b className={anyPending ? "due" : "paid"}>{totalDueText}</b>
            <span className={anyPending ? "pend" : "ok"}>{anyPending ? "Pending" : "Paid"}</span>
          </div>
          {checkNo ? (
            <em className="ck" title="Número de cheque (del reporte)"><small>Cheque</small>#{checkNo}</em>
          ) : null}
          <button type="button" onClick={onOpenReport}>{reportPayload ? "Editar" : "Llenar"}</button>
        </div>
      </article>
    );
  }

  return (
    <div
      className={cn(
        "company-card animate-card-in group relative flex h-full flex-col overflow-hidden rounded-3xl border transition-[transform,box-shadow] duration-200 ease-out",
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
                onError={onCoverError}
                loading="lazy"
                decoding="async"
                className="h-full w-full bg-zinc-100 object-cover transition duration-300 group-hover/img:scale-[1.03] dark:bg-zinc-800"
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

        {/* Botón grande y visible para abrir/editar el documento (antes había que adivinar que se tocaba la imagen) */}
        <button
          type="button"
          onClick={onOpenReport}
          className="co-edit mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3 text-sm font-bold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          <SquarePen className="h-4 w-4" />
          {reportPayload ? "Editar reporte" : "Llenar reporte"}
        </button>

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

  async function saveEntry(): Promise<boolean> {
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
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando");
      return false;
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

  // ¿Hay una nota escrita/cambiada sin guardar?
  const [confirmClose, setConfirmClose] = useState(false);
  const [savingFromDialog, setSavingFromDialog] = useState(false);
  const dirty = isEditingExisting
    ? draftNote.trim() !== (selected?.note ?? "").trim() || draftAgent.trim() !== (selected?.agent ?? "").trim()
    : draftNote.trim() !== "" || draftAgent.trim() !== "";

  function requestClose() {
    if (savingFromDialog) return;
    if (confirmClose) { setConfirmClose(false); return; }
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-4"
      onClick={requestClose}
    >
      {confirmClose ? (
        <UnsavedChangesDialog
          title={isEditingExisting ? "¿Guardar los cambios?" : "¿Guardar esta nota?"}
          message={isEditingExisting ? "Hiciste cambios en esta nota que todavía no se han guardado." : "Escribiste una nota que todavía no se ha guardado."}
          saveLabel={isEditingExisting ? "Guardar cambios" : "Guardar nota"}
          canSave={!!draftNote.trim()}
          cantSaveHint="Para guardar, escribe el texto de la nota."
          saving={savingFromDialog}
          onSave={async () => {
            setSavingFromDialog(true);
            const ok = await saveEntry();
            setSavingFromDialog(false);
            if (ok) { setConfirmClose(false); onClose(); }
          }}
          onDiscard={() => {
            // Descartar también borra el borrador guardado en este dispositivo
            try { window.localStorage.removeItem(draftKey()); } catch {}
            setConfirmClose(false);
            onClose();
          }}
          onKeepEditing={() => setConfirmClose(false)}
        />
      ) : null}
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
            onClick={requestClose}
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

