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
import { noticeOrAlert } from "@/lib/exportNotice";
import { isMobileExport, NSF_FOLDER_NAME, OutboxPendingError, connectNsfFolder, exportPdfName, exportRow, exportYear, sendToOneDriveViaPc, writeExportFile, yearFolderForExport } from "@/lib/nsfExport";

export default function ReportModal({
  noteId,
  companyTitle,
  initialReport,
  onLocalReportUpdate,
  onReportSynced,
  onCompanyNameChange,
  onDiscarded,
  onClose,
}: {
  noteId: string;
  onDiscarded?: () => void;
  companyTitle: string;
  initialReport: any;
  onLocalReportUpdate: (payload: unknown) => void;
  onReportSynced?: (meta: { updatedAt?: string | null; updatedBy?: any | null }) => void;
  /** Se llama cuando el usuario cambia el "Company Name" dentro del reporte (para actualizar el título de la tarjeta). */
  onCompanyNameChange?: (name: string) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Siempre usar las versiones MÁS RECIENTES de los callbacks. Antes, el listener de mensajes se
  // registraba una sola vez y quedaba con callbacks viejos (datos desactualizados).
  const propsRef = useRef({ onLocalReportUpdate, onReportSynced, onCompanyNameChange });
  propsRef.current = { onLocalReportUpdate, onReportSynced, onCompanyNameChange };

  // ── Control de cambios sin guardar ──
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const iframeLoadedRef = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const baselineRef = useRef<{ sig: string; payload: any } | null>(null);
  const loadedAtRef = useRef<number>(0);
  const origTitleRef = useRef(companyTitle);
  const titleRef = useRef(companyTitle);
  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  const pendingPayloadRef = useRef<any>(null);

  function payloadSig(payload: any) {
    try {
      const imgs = Array.isArray(payload?.images) ? payload.images : [];
      return JSON.stringify({
        fields: payload?.fields ?? {},
        images: imgs.map((im: any) => String(im?.id ?? im?.path ?? "")),
      });
    } catch {
      return String(Math.random());
    }
  }

  // Si el usuario editó el "Company Name" dentro del reporte, actualiza también el título de la tarjeta.
  function syncCompanyName(payload: any) {
    try {
      const nm = String(payload?.fields?.companyName ?? "").trim();
      if (!nm) return;
      if (nm.toLowerCase() === titleRef.current.trim().toLowerCase()) return;
      titleRef.current = nm;
      propsRef.current.onCompanyNameChange?.(nm);
    } catch {}
  }
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
      propsRef.current.onReportSynced?.({ updatedAt });
    } catch {}
    return;
  }

  async function saveNow(payload: any) {
    if (!payload) return;
    if (savingRef.current) {
      // Ya hay un guardado en curso: dejamos este como "pendiente" para guardarlo apenas termine.
      // (Antes se descartaba y el último cambio podía quedar sin guardar.)
      pendingPayloadRef.current = payload;
      return;
    }
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
      const next = pendingPayloadRef.current;
      if (next) {
        pendingPayloadRef.current = null;
        void saveNow(next);
      }
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
    // El server guarda las imágenes como {id,name,path} (sin URL firmada): se firman TODAS de una sola vez.
    try {
      const imgs = Array.isArray(payload?.images) ? (payload.images as any[]) : [];
      if (!imgs.length) return payload;
      const need = imgs.filter((im) => {
        const path = typeof im?.path === "string" ? String(im.path).trim() : "";
        const hasUrl = typeof im?.url === "string" && String(im.url).trim();
        const hasDataUrl = typeof im?.dataUrl === "string" && String(im.dataUrl).startsWith("data:image/");
        return !!path && !hasUrl && !hasDataUrl;
      });
      if (!need.length) return payload;
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("attachments")
        .createSignedUrls(need.map((im) => String(im.path).trim()), 60 * 60 * 24);
      const byPath = new Map<string, string>();
      for (const sg of data ?? []) if (sg?.path && sg?.signedUrl) byPath.set(sg.path, sg.signedUrl);
      const nextImgs = imgs.map((im) => {
        const url = byPath.get(String(im?.path ?? "").trim());
        return url ? { ...im, url } : im;
      });
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
      // Si el iframe ya cargó antes de tener las URLs de las imágenes, se las enviamos ya (sin esperar).
      if (iframeLoadedRef.current && !dirtyRef.current && Array.isArray(enriched?.images) && enriched.images.length) {
        try { iframeRef.current?.contentWindow?.postMessage({ type: "rc:init", noteId, initialReport: enriched }, "*"); } catch {}
      }
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
        void shareReport();
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
          propsRef.current.onLocalReportUpdate((data as any).payload);
        } catch {}

        // ¿Hay cambios respecto a como estaba al abrir? (los primeros ~1.5 s tras cargar son "la base":
        // el formulario se normaliza solo al abrir y eso no cuenta como edición del usuario)
        try {
          const sig = payloadSig((data as any).payload);
          if (!baselineRef.current || Date.now() - loadedAtRef.current < 1500) {
            baselineRef.current = { sig, payload: (data as any).payload };
            setDirty(false);
          } else {
            setDirty(sig !== baselineRef.current.sig);
          }
          const nm = String(((data as any).payload as any)?.fields?.companyName ?? "").trim();
          if (nm) setLiveTitle(nm);
        } catch {}

        // Throttle saves to avoid spamming DB while typing
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(async () => {
          await saveNow((data as any).payload);
          if (Date.now() - loadedAtRef.current > 1500) syncCompanyName((data as any).payload);
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
      // Si hay un guardado en curso, esperamos a que termine para no perder el último cambio.
      for (let i = 0; i < 30 && savingRef.current; i++) {
        await new Promise((r) => window.setTimeout(r, 100));
      }
      await saveNow(lastPayloadRef.current);
      if (baselineRef.current && lastPayloadRef.current && payloadSig(lastPayloadRef.current) !== baselineRef.current.sig) {
        syncCompanyName(lastPayloadRef.current);
      }
    } catch {
      // ignore
    } finally {
      onClose();
      setClosing(false);
    }
  }

  // Descartar: vuelve el reporte (y el nombre de la compañía) a como estaban al abrir.
  async function discardAndClose() {
    if (closing || discarding) return;
    setDiscarding(true);
    try { onDiscarded?.(); } catch {}
    try {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingPayloadRef.current = null;
      for (let i = 0; i < 30 && savingRef.current; i++) {
        await new Promise((r) => window.setTimeout(r, 100));
      }
      const base = baselineRef.current?.payload ?? null;
      if (base && online) {
        try {
          await postReportPayloadToServer(sanitizeReportForServer(base));
          removeQueuedReport(noteId);
          propsRef.current.onLocalReportUpdate(base);
        } catch {
          // si falla la red, al menos no dejamos nada en cola
        }
      } else {
        removeQueuedReport(noteId);
      }
      if (titleRef.current.trim().toLowerCase() !== origTitleRef.current.trim().toLowerCase()) {
        titleRef.current = origTitleRef.current;
        propsRef.current.onCompanyNameChange?.(origTitleRef.current);
      }
    } finally {
      setConfirmClose(false);
      setDiscarding(false);
      onClose();
    }
  }

  // Cerrar por clic afuera / botón Cerrar: si hay cambios, preguntar primero.
  function requestClose() {
    if (closing || discarding) return;
    if (confirmClose) { setConfirmClose(false); return; }
    if (dirty) { setConfirmClose(true); return; }
    void flushAndClose();
  }

  useEffect(() => {
    // keep report company name in sync with note title
    postToIframe({ type: "rc:setCompanyName", companyName: companyTitle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyTitle]);

  async function shareReport() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const notice = await noticeOrAlert();
    notice.start("Exportando…", "Preparando el PDF");

    let dir: FileSystemDirectoryHandle | null = null;
    const mobile = isMobileExport();
    try {
      if (mobile) {
        dir = null;
      } else {
      dir = await yearFolderForExport();
      }
      if (!dir && !mobile) {
        notice.close();
        const ok = await connectNsfFolder();
        if (ok) dir = await yearFolderForExport();
        notice.start("Exportando…", "Preparando el PDF");
      }
    } catch (e) {
      notice.error("No se pudo abrir la carpeta de OneDrive", e instanceof Error ? e.message : "");
      return;
    }

    if (!dir && !mobile) {
      notice.error("NO se guardó el PDF", "No hay carpeta de OneDrive conectada. Activa el ayudante (INSTALAR.bat) o elige la carpeta NSF CHECKS PDF FILES.");
      return;
    }

    const reqId = `share-${Date.now()}`;
    const payload = lastPayloadRef.current ?? initReport;
    const filename = exportPdfName(
      exportRow({
        company: (liveTitle ?? titleRef.current ?? companyTitle).trim(),
        fields: payload?.fields ?? null,
      }),
    );

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
      notice.error("NO se guardó el PDF", `No se pudo generar el PDF: ${err instanceof Error ? err.message : err}`);
      return;
    }

    if (!buffer) {
      notice.error("NO se guardó el PDF", "El PDF salió vacío.");
      return;
    }

    const blob = new Blob([buffer], { type: "application/pdf" });
    if (mobile) {
      try {
        const saved = await sendToOneDriveViaPc(filename, blob, (msg) => notice.update("Exportando…", msg));
        notice.success("Exportado a OneDrive", saved.file);
      } catch (e) {
        if (e instanceof OutboxPendingError) {
          notice.error(
            "TODAVÍA NO está en OneDrive",
            "Tu computadora está apagada o el ayudante no está activo. El PDF quedó en espera y se guardará solo en la carpeta del año cuando la enciendas. Hasta ese momento no lo tomes como guardado.",
          );
        } else {
          notice.error("NO se guardó el PDF", e instanceof Error ? e.message : "No se pudo enviar a OneDrive");
        }
      }
      return;
    }
    if (!dir) {
      notice.error("NO se guardó el PDF", "No hay carpeta de OneDrive conectada.");
      return;
    }
    notice.update("Exportando…", "Guardando en OneDrive");
    try {
      await writeExportFile(dir, filename, blob);
      notice.success("Exportado a OneDrive", `${NSF_FOLDER_NAME}\\${exportYear()}\\${filename}`);
    } catch (e) {
      notice.error("NO se guardó el PDF", e instanceof Error ? e.message : "No se pudo guardar en OneDrive");
    }
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
      onClick={() => requestClose()}
    >
      {confirmClose ? (
        <UnsavedChangesDialog
          title="¿Guardar los cambios del reporte?"
          message="Hiciste cambios en este reporte. Elige qué quieres hacer antes de cerrar."
          saveLabel="Guardar y cerrar"
          discardLabel="Descartar cambios"
          saving={closing || discarding}
          onSave={() => { setConfirmClose(false); return flushAndClose(); }}
          onDiscard={() => discardAndClose()}
          onKeepEditing={() => setConfirmClose(false)}
        />
      ) : null}
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
            <p className="truncate text-sm font-bold leading-tight text-zinc-900 dark:text-zinc-50">{liveTitle ?? companyTitle}</p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Exportar manual a OneDrive */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void shareReport(); }}
              title="Exportar este reporte a OneDrive"
              className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar
            </button>

            {/* Imprimir */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void shareReport(); }}
              title="Guardar PDF en OneDrive"
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
              onClick={(e) => { e.stopPropagation(); requestClose(); }}
              disabled={closing || discarding}
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
            onLoad={() => {
              try {
                loadedAtRef.current = Date.now();
                iframeLoadedRef.current = true;
                baselineRef.current = null;
                setDirty(false);
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
