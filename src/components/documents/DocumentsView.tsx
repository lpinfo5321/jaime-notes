"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Image as ImageIcon, File, Upload, Trash2, Download,
  Share2, Printer, Search, X, FolderOpen, Plus, Eye,
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

const BUCKET = "attachments";

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
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const isImage = doc.mime_type.startsWith("image/");
  const isPDF = doc.mime_type === "application/pdf";

  function handlePrint() {
    if (!doc.url) return;
    const win = window.open(doc.url, "_blank");
    win?.addEventListener("load", () => win.print());
  }

  function handleDownload() {
    if (!doc.url) return;
    const a = document.createElement("a");
    a.href = doc.url;
    a.download = doc.name;
    a.click();
  }

  function handleShare() {
    if (!doc.url) return;
    if (navigator.share) {
      navigator.share({ title: doc.name, url: doc.url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(doc.url).catch(() => {});
      alert("Enlace copiado al portapapeles");
    }
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <p className="truncate text-sm font-semibold text-white max-w-[60vw]">{doc.name}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrint}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Imprimir"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownload}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Descargar"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Compartir"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* content */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        {isImage && doc.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.url}
            alt={doc.name}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        ) : isPDF && doc.url ? (
          <iframe
            src={doc.url}
            title={doc.name}
            className="h-full w-full max-w-4xl rounded-2xl bg-white shadow-2xl"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br ${mimeColor(doc.mime_type)}`}>
              <FileIcon mime={doc.mime_type} className="h-10 w-10 text-white" />
            </div>
            <p className="text-lg font-semibold text-white">{doc.name}</p>
            <p className="text-sm text-zinc-400">Vista previa no disponible para este tipo de archivo</p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              <Download className="h-4 w-4" /> Descargar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Delete Modal ─────────────────────── */
function DeleteModal({ name, onConfirm, onCancel, busy }: {
  name: string; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="animate-scale-in relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-950">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/40">
          <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">Eliminar documento</h3>
        <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Eliminar <strong className="text-zinc-700 dark:text-zinc-200">{name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={busy} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Doc Card ─────────────────────── */
function DocCard({ doc, onPreview, onDelete }: {
  doc: Doc; onPreview: () => void; onDelete: () => void;
}) {
  const isImage = doc.mime_type.startsWith("image/");
  const color = mimeColor(doc.mime_type);

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (!doc.url) return;
    const a = document.createElement("a");
    a.href = doc.url;
    a.download = doc.name;
    a.click();
  }

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if (!doc.url) return;
    if (navigator.share) {
      navigator.share({ title: doc.name, url: doc.url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(doc.url).catch(() => {});
    }
  }

  return (
    <div
      className="animate-card-in group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/70 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800/50 dark:bg-zinc-900/60 dark:hover:border-zinc-700/60"
      onClick={onPreview}
    >
      {/* accent bar */}
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${color}`} />

      {/* thumbnail or icon */}
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-800/40">
        {isImage && doc.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.url}
            alt={doc.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${color} shadow-md`}>
            <FileIcon mime={doc.mime_type} className="h-8 w-8 text-white" />
          </div>
        )}

        {/* hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-zinc-800 shadow">
            <Eye className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{doc.name}</p>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>{prettySize(doc.size)}</span>
          <span>·</span>
          <span>{prettyDate(doc.created_at)}</span>
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-1 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <button
          onClick={handleDownload}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Descargar"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleShare}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Compartir"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── Main View ─────────────────────── */
export default function DocumentsView() {
  const supabase = useMemo(() => createClient(), []);
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
        const path = `docs/${user.id}/${crypto.randomUUID()}/${safe}`;

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
    try {
      await fetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {}
    setDeleteBusy(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  return (
    <div className="min-h-[60vh] pb-20">
      {/* ── Top bar ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
            <FolderOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Documentos</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {docs.length} {docs.length === 1 ? "archivo" : "archivos"}
            </p>
          </div>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          {uploading ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900" /> Subiendo…</>
          ) : (
            <><Plus className="h-4 w-4" /> Subir archivo</>
          )}
        </button>
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
          <pre className="overflow-x-auto rounded-xl bg-amber-100 p-3 text-[11px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 whitespace-pre-wrap">{`create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  path       text not null,
  mime_type  text not null default '',
  size       bigint not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy "docs select" on public.documents for select using (auth.uid() = user_id);
create policy "docs insert" on public.documents for insert with check (auth.uid() = user_id);
create policy "docs update" on public.documents for update using (auth.uid() = user_id);
create policy "docs delete" on public.documents for delete using (auth.uid() = user_id);
create trigger documents_updated_at before update on public.documents
  for each row execute procedure public.set_updated_at();`}</pre>
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

      {/* ── Search ── */}
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/50">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar documentos…"
          className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400"
        />
        {q && <button onClick={() => setQ("")} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>}
      </div>

      {/* ── Drop zone (when no files or always visible) ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !docs.length && fileInputRef.current?.click()}
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver
            ? "border-indigo-400 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/20"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
        } ${docs.length ? "py-5" : "py-12"}`}
      >
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${dragOver ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <p className={`text-sm font-semibold ${dragOver ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-600 dark:text-zinc-300"}`}>
            {dragOver ? "Suelta aquí para subir" : "Arrastra archivos aquí"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">o haz clic en "Subir archivo" — Imágenes, PDF, Word, Excel…</p>
        </div>
      </div>

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
              onPreview={() => setPreview(doc)}
              onDelete={() => setDeleteTarget(doc)}
            />
          ))}
        </div>
      ) : null}

      {/* ── Preview modal ── */}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      {/* ── Delete modal ── */}
      {deleteTarget && (
        <DeleteModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}
