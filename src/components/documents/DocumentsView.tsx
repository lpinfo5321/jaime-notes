"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Image as ImageIcon, File, Upload, Trash2, Download,
  Share2, Printer, Search, X, FolderOpen, Plus, Eye,
  Pencil, Check, CheckSquare, Square,
} from "lucide-react";

/* ─────────────────────── types ─────────────────────── */
interface Doc {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size: number;
  description?: string;
  created_at: string;
  url: string | null;
}

const BUCKET = "documents";

/* ─────────────────────── helpers ─────────────────────── */
function prettySize(bytes: number) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function prettyDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function sanitizeName(name: string) {
  return name.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120);
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className={className} />;
  if (mime === "application/pdf") return <FileText className={className} />;
  return <File className={className} />;
}

function mimeColor(mime: string) {
  if (mime.startsWith("image/")) return "from-sky-500 to-blue-600";
  if (mime === "application/pdf") return "from-rose-500 to-red-600";
  if (mime.includes("word") || mime.includes("document")) return "from-blue-500 to-indigo-600";
  if (mime.includes("sheet") || mime.includes("excel")) return "from-emerald-500 to-green-600";
  return "from-zinc-500 to-zinc-600";
}

/* ─────────────────────── Preview Modal ─────────────────────── */
function PreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const isImage = doc.mime_type.startsWith("image/");
  const isPDF = doc.mime_type === "application/pdf";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleDownload() {
    if (!doc.url) return;
    const a = document.createElement("a"); a.href = doc.url; a.download = doc.name; a.click();
  }
  function handleShare() {
    if (!doc.url) return;
    if (navigator.share) navigator.share({ title: doc.name, url: doc.url }).catch(() => {});
    else navigator.clipboard.writeText(doc.url).catch(() => {});
  }
  function handlePrint() {
    if (!doc.url) return;
    const isImg = doc.mime_type.startsWith("image/");
    const html = `<!DOCTYPE html><html><head><style>body{margin:0;}img{max-width:100%;height:auto;display:block;}iframe{width:100vw;height:100vh;border:none;}</style></head><body>${isImg ? `<img src="${doc.url}"/>` : `<iframe src="${doc.url}"></iframe>`}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    w.addEventListener("load", () => { w.focus(); w.print(); });
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "56rem",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "16px",
          background: "white",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800" style={{ background: "white" }}>
          <p className="min-w-0 truncate text-sm font-semibold text-zinc-900">{doc.name}</p>
          <div className="ml-3 flex shrink-0 items-center gap-2">
            <a
              href={doc.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Abrir en pestaña
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#f9fafb" }}>
          {isImage && doc.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.name}
              style={{ maxHeight: "75vh", width: "100%", objectFit: "contain", display: "block" }}
            />
          ) : isPDF && doc.url ? (
            <iframe
              src={`${doc.url}#toolbar=1`}
              title={doc.name}
              style={{ height: "75vh", width: "100%", border: "none", display: "block" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${mimeColor(doc.mime_type)}`}>
                <FileIcon mime={doc.mime_type} className="h-8 w-8 text-white" />
              </div>
              <p className="font-semibold text-zinc-700">{doc.name}</p>
              <p className="text-sm text-zinc-400">Vista previa no disponible para este tipo de archivo</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3" style={{ background: "white" }}>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="h-3.5 w-3.5" /> Descargar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────── Delete Modal ─────────────────────── */
function DeleteModal({ name, onConfirm, onCancel, busy }: {
  name: string; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return createPortal(
    <div
      style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99999, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}
      onClick={onCancel}
    >
      <div
        style={{ width:"100%", maxWidth:"400px", background:"white", borderRadius:"20px", padding:"24px", boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"48px", height:"48px", borderRadius:"14px", background:"#fee2e2", marginBottom:"16px" }}>
          <Trash2 style={{ width:"22px", height:"22px", color:"#dc2626" }} />
        </div>
        <h3 style={{ margin:"0 0 6px", fontSize:"15px", fontWeight:700, color:"#111827" }}>Eliminar documento</h3>
        <p style={{ margin:"0 0 20px", fontSize:"13px", color:"#6b7280" }}>
          ¿Eliminar <strong style={{ color:"#374151" }}>{name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div style={{ display:"flex", gap:"8px" }}>
          <button onClick={onCancel} style={{ flex:1, padding:"10px", borderRadius:"12px", border:"1px solid #e5e7eb", background:"white", fontSize:"13px", fontWeight:600, color:"#4b5563", cursor:"pointer" }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ flex:1, padding:"10px", borderRadius:"12px", border:"none", background:"#dc2626", fontSize:"13px", fontWeight:600, color:"white", cursor:"pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────── Doc Card ─────────────────────── */
function DocCard({ doc, onPreview, onDelete, onRename, selectMode, selected, onSelect }: {
  doc: Doc; onPreview: () => void; onDelete: () => void; onRename: () => void;
  selectMode: boolean; selected: boolean; onSelect: () => void;
}) {
  const isImage = doc.mime_type.startsWith("image/");
  const color = mimeColor(doc.mime_type);

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (!doc.url) return;
    const a = document.createElement("a"); a.href = doc.url; a.download = doc.name; a.click();
  }
  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if (!doc.url) return;
    if (navigator.share) navigator.share({ title: doc.name, url: doc.url }).catch(() => {});
    else navigator.clipboard.writeText(doc.url).catch(() => {});
  }
  function handlePrintSingle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!doc.url) return;
    const isImg = doc.mime_type.startsWith("image/");
    const html = `<!DOCTYPE html><html><head><style>body{margin:0;}img{max-width:100%;max-height:100vh;object-fit:contain;display:block;}iframe{width:100vw;height:100vh;border:none;}</style></head><body>${isImg ? `<img src="${doc.url}"/>` : `<iframe src="${doc.url}"></iframe>`}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    w.addEventListener("load", () => { w.focus(); w.print(); });
  }

  return (
    <div
      className={`animate-card-in group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900 ${
        selected ? "border-indigo-400 ring-2 ring-indigo-300 dark:border-indigo-500 dark:ring-indigo-600" : "border-zinc-200/60 dark:border-zinc-800/50"
      }`}
      onClick={onPreview}
    >
      {/* select checkbox */}
      {selectMode && (
        <div
          className="absolute left-2 top-2 z-10"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div className={`flex h-6 w-6 items-center justify-center rounded-lg shadow ${selected ? "bg-indigo-600 text-white" : "bg-white/90 text-zinc-400 dark:bg-zinc-800"}`}>
            {selected ? <Check className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </div>
        </div>
      )}

      {/* thumbnail or icon */}
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {isImage && doc.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.url} alt={doc.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${color} shadow`}>
            <FileIcon mime={doc.mime_type} className="h-7 w-7 text-white" />
          </div>
        )}
        {!selectMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-zinc-800 shadow">
              <Eye className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{doc.name}</p>
        <p className="text-xs text-zinc-400">{prettySize(doc.size)} · {prettyDate(doc.created_at)}</p>
      </div>

      {/* actions */}
      {!selectMode && (
        <div className="flex items-center gap-1 border-t border-zinc-100 px-2 py-1.5 dark:border-zinc-800/60">
          <button onClick={handlePrintSingle} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Imprimir">
            <Printer className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleDownload} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Descargar">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleShare} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Compartir">
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRename(); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Renombrar">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400" title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Rename Modal ─────────────────────── */
function RenameModal({ doc, onSave, onClose }: {
  doc: Doc; onSave: (name: string) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim());
    setBusy(false);
  }

  return createPortal(
    <div
      style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99999, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}
      onClick={onClose}
    >
      <div
        style={{ width:"100%", maxWidth:"400px", background:"white", borderRadius:"20px", padding:"24px", boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin:"0 0 16px", fontSize:"15px", fontWeight:700, color:"#111827" }}>Renombrar documento</h3>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          style={{ width:"100%", padding:"10px 12px", borderRadius:"12px", border:"1px solid #e5e7eb", background:"#f9fafb", fontSize:"14px", outline:"none", boxSizing:"border-box" }}
          placeholder="Nombre del documento"
        />
        <div style={{ display:"flex", gap:"8px", marginTop:"16px" }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", borderRadius:"12px", border:"1px solid #e5e7eb", background:"white", fontSize:"13px", fontWeight:600, color:"#4b5563", cursor:"pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={busy || !name.trim()} style={{ flex:1, padding:"10px", borderRadius:"12px", border:"none", background:"#111827", fontSize:"13px", fontWeight:600, color:"white", cursor:"pointer", opacity: (busy || !name.trim()) ? 0.5 : 1 }}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────── Main View ─────────────────────── */
export default function DocumentsView({ onBack }: { onBack?: () => void } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [isBrowser, setIsBrowser] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Doc | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNeedsSetup(false);
    setError(null);
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
      if (json.error) {
        if (json.error.includes("does not exist") || json.error.includes("relation")) {
          setNeedsSetup(true);
        } else {
          setError(json.error);
        }
      } else {
        setDocs(json.documents ?? []);
      }
    } catch (e: any) {
      setError("Error de red: " + (e?.message ?? "desconocido"));
    }
    setLoading(false);
  }, []);

  useEffect(() => { setIsBrowser(true); }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!q.trim()) return docs;
    const lq = q.toLowerCase();
    return docs.filter((d) => d.name.toLowerCase().includes(lq) || (d.description ?? "").toLowerCase().includes(lq));
  }, [docs, q]);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    setError(null);

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      setUploadProgress(`Subiendo ${i + 1} de ${arr.length}: ${file.name}`);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError("No autenticado. Recarga la página."); break; }

        const ext = file.name.split(".").pop() ?? "";
        const safe = sanitizeName(file.name);
        const path = `${user.id}/${crypto.randomUUID()}/${safe}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (upErr) {
          setError(`Error al subir "${file.name}": ${upErr.message}`);
          continue;
        }

        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            path,
            mime_type: file.type || (ext ? `application/${ext}` : "application/octet-stream"),
            size: file.size,
          }),
        });
        const json = await res.json();
        if (json.error) {
          setError(`Error al guardar "${file.name}": ${json.error}`);
          if (json.error.includes("does not exist") || json.error.includes("relation")) {
            setNeedsSetup(true);
          }
        } else if (json.id) {
          await load();
        }
      } catch (e: any) {
        setError(`Error inesperado: ${e?.message ?? "desconocido"}`);
      }
    }
    setUploadProgress(null);
    setUploading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Error al eliminar: ${json.error ?? res.statusText}`);
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      setDeleteTarget(null);
    } catch (e: any) {
      setError(`Error de red: ${e?.message ?? "desconocido"}`);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleRename(doc: Doc, newName: string) {
    await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, name: newName } : d));
    setRenameTarget(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function printSelected() {
    const selected = docs.filter((d) => selectedIds.has(d.id) && d.url);
    if (!selected.length) return;
    const html = `<!DOCTYPE html><html><head><style>
      body{margin:0;padding:0;}
      .page{page-break-after:always;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;}
      .page:last-child{page-break-after:auto;}
      img{max-width:100%;max-height:100%;object-fit:contain;}
      iframe{width:100%;height:100%;border:none;}
      h3{font-family:sans-serif;font-size:12px;color:#666;margin:0 0 4px;}
    </style></head><body>
    ${selected.map((d) => `<div class="page">
      <div style="width:100%;height:100%;display:flex;flex-direction:column;padding:16px;box-sizing:border-box;">
        <h3>${d.name}</h3>
        ${d.mime_type.startsWith("image/") ? `<img src="${d.url}" />` : `<iframe src="${d.url}"></iframe>`}
      </div>
    </div>`).join("")}
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.addEventListener("load", () => { w.focus(); w.print(); });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  return (
    <div className="min-h-[60vh] pb-20">
      {/* ── Sticky compact header ── */}
      <div className="sticky top-[116px] z-10 mb-4 flex items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/90" style={{boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}>
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Volver al Dashboard"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        )}
        {/* Icon + title */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
            <FolderOpen className="h-4 w-4 text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Documentos</span>
            <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
              {docs.length}
              {selectMode && selectedIds.size > 0 && ` · ${selectedIds.size} sel.`}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar documento…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {q && <button onClick={() => setQ("")} className="text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Print selected */}
          {selectMode && selectedIds.size > 0 && (
            <button onClick={printSelected} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imprimir ({selectedIds.size})</span>
            </button>
          )}
          {/* Select toggle */}
          {docs.length > 0 && (
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                selectMode
                  ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {selectMode ? <><X className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cancelar</span></> : <><CheckSquare className="h-3.5 w-3.5" /><span className="hidden sm:inline">Seleccionar</span></>}
            </button>
          )}
          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {uploading
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900" />
              : <><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Subir</span></>
            }
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          className="hidden"
          onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* ── Error banner ── */}
      {needsSetup && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
          <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">⚠️ Falta un paso de configuración</p>
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">La tabla de documentos no existe en Supabase. Ve a <strong>SQL Editor</strong> en tu proyecto y ejecuta:</p>
          <pre className="overflow-x-auto rounded-xl bg-amber-100 p-3 text-[11px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 whitespace-pre-wrap">{`-- 1. Crear tabla
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  path        text not null,
  mime_type   text not null default '',
  size        bigint not null default 0,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy "docs select" on public.documents for select using (auth.uid() = user_id);
create policy "docs insert" on public.documents for insert with check (auth.uid() = user_id);
create policy "docs update" on public.documents for update using (auth.uid() = user_id);
create policy "docs delete" on public.documents for delete using (auth.uid() = user_id);
create trigger documents_updated_at before update on public.documents
  for each row execute procedure public.set_updated_at();

-- 2. Crear bucket de storage
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 3. Políticas de storage
create policy "docs storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents');
create policy "docs storage select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');
create policy "docs storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents');`}</pre>
          <button onClick={load} className="mt-3 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            Reintentar
          </button>
        </div>
      )}

      {error && !needsSetup && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/30">
          <p className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {uploadProgress && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/50 dark:bg-blue-950/30">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
          <p className="text-sm text-blue-700 dark:text-blue-300">{uploadProgress}</p>
        </div>
      )}

      {/* ── Drop zone (sutil, solo activo al arrastrar o sin archivos) ── */}
      {(dragOver || docs.length === 0) && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-5 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all ${
            dragOver
              ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/20"
              : "border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/30"
          }`}
        >
          <Upload className={`h-5 w-5 shrink-0 ${dragOver ? "text-indigo-500" : "text-zinc-400"}`} />
          <p className={`text-sm font-medium ${dragOver ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500 dark:text-zinc-400"}`}>
            {dragOver ? "Suelta para subir" : "Arrastra archivos aquí o usa el botón ↑"}
          </p>
        </div>
      )}
      {/* drop target invisible cuando ya hay archivos */}
      {docs.length > 0 && !dragOver && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          className="fixed inset-0 z-0 pointer-events-none"
        />
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
          <span className="text-sm">Cargando documentos…</span>
        </div>
      ) : visible.length === 0 && docs.length > 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="font-semibold text-zinc-600 dark:text-zinc-300">No se encontraron documentos</p>
          <p className="text-sm text-zinc-400">Intenta con otro término</p>
        </div>
      ) : visible.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              selectMode={selectMode}
              selected={selectedIds.has(doc.id)}
              onSelect={() => toggleSelect(doc.id)}
              onPreview={() => selectMode ? toggleSelect(doc.id) : setPreview(doc)}
              onDelete={() => setDeleteTarget(doc)}
              onRename={() => setRenameTarget(doc)}
            />
          ))}
        </div>
      ) : null}

      {/* ── Modals (only client-side to avoid SSR issues with createPortal) ── */}
      {isBrowser && preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {isBrowser && deleteTarget && (
        <DeleteModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={deleteBusy}
        />
      )}
      {isBrowser && renameTarget && (
        <RenameModal
          doc={renameTarget}
          onSave={(name) => handleRename(renameTarget, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}
