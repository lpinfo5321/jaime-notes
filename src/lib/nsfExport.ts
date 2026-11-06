import { normText, pickField, statusFromPaymentMethod } from "@/components/notes/notesUtils";

/** Carpeta madre en OneDrive. Dentro se crea sola la carpeta del año en curso. */
export const NSF_FOLDER_NAME = "NSF CHECKS PDF FILES";
export const NSF_FOLDER_HINT =
  "C:\\Users\\lapri\\OneDrive\\LA PRIMAVERA SUPERMARKET INC\\CHECK CASHING SERVICES\\RETURNED CHECKS\\NSF CHECKS PDF FILES";

const DB_NAME = "rc-nsf-export";
const STORE = "handles";
const HANDLE_KEY = "parent";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type ExportRow = {
  fecha: string;
  pagado: "PAGADO" | "PENDIENTE";
  compania: string;
  cheque: string;
  /** YYYY-MM-DD. Sirve para ordenar; no se escribe en el archivo. */
  orden: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(raw: unknown): string {
  const s = normText(raw);
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!us) return "";
  let y = Number(us[3]);
  if (y < 100) y += 2000;
  const mo = Number(us[1]);
  const d = Number(us[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function fileDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const name = MONTHS[Number(m) - 1] ?? "ENE";
  return `${name} ${d}, ${y}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function safePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
}

/** Fecha, pagado, compañía y número de cheque, en ese orden. */
export function exportRow(input: {
  company: string;
  fields?: Record<string, unknown> | null;
  bucket?: "pending" | "completed" | "trash" | null;
  createdAt?: string;
  latestDate?: string;
}): ExportRow {
  const fields = input.fields ?? null;
  const fechaIso =
    toIso(pickField(fields, ["dateReturned", "date_returned"])) ||
    toIso(pickField(fields, ["dateCashed", "date_cashed"])) ||
    toIso(pickField(fields, ["dateDeposit", "date_deposit"])) ||
    toIso(input.latestDate) ||
    toIso(input.createdAt) ||
    todayIso();
  const check = statusFromPaymentMethod(
    pickField(fields, ["checkPaymentMethod", "check_payment_method"]),
    { allowRedeposited: true },
  );
  const pagado = input.bucket === "completed" || check.tone === "paid" ? "PAGADO" : "PENDIENTE";
  const cheque = normText(pickField(fields, ["checkNumber", "check_number"])).replace(/^#/, "");
  const compania =
    normText(input.company) || normText(pickField(fields, ["companyName", "company_name"])) || "SIN COMPANIA";
  return { fecha: fileDate(fechaIso), pagado, compania, cheque, orden: fechaIso };
}

export function exportPdfName(row: ExportRow) {
  const company = safePart(row.compania) || "SIN COMPANIA";
  const ck = safePart(row.cheque) || "SIN NUMERO";
  const name = `${row.fecha} ${row.pagado} ${company} CK ${ck}.pdf`;
  return name.length > 180 ? `${name.slice(0, 176).trim()}.pdf` : name;
}

export function csvExportName(now = new Date()) {
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${fileDate(iso)} EXPORTACION ${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  const out = s.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${out}"` : out;
}

/** Columnas: Fecha, Pagado, Compañía, # de cheque. */
export function rowsToCsv(rows: ExportRow[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      a.orden.localeCompare(b.orden) ||
      a.pagado.localeCompare(b.pagado) ||
      a.compania.localeCompare(b.compania) ||
      a.cheque.localeCompare(b.cheque, undefined, { numeric: true }),
  );
  const lines = [["Fecha", "Pagado", "Compania", "# de cheque"].join(",")];
  for (const row of sorted) {
    lines.push([csvEscape(row.fecha), csvEscape(row.pagado), csvEscape(row.compania), csvEscape(row.cheque)].join(","));
  }
  return lines.join("\n");
}

export function uniqueExportName(used: Set<string>, filename: string) {
  const key = filename.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let i = 2;
  let next = "";
  do {
    next = `${base} (${i})${ext}`;
    i += 1;
  } while (used.has(next.toLowerCase()));
  used.add(next.toLowerCase());
  return next;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(handle: FileSystemDirectoryHandle) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function nsfFolderLinked() {
  try {
    return !!(await idbGet());
  } catch {
    return false;
  }
}

type PickerWindow = Window & {
  showDirectoryPicker?: (opts: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

/** El navegador no deja escribir en C:\ sin que la persona elija la carpeta una vez. */
export async function connectNsfFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    alert("Para guardar en OneDrive abre la app en Chrome o Edge, en esta computadora.");
    return false;
  }
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: "nsf-checks-pdf-files", mode: "readwrite" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    alert("No se pudo abrir el selector de carpetas.");
    return false;
  }
  if (handle.name.trim().toLowerCase() !== NSF_FOLDER_NAME.toLowerCase()) {
    alert(
      `Elegiste "${handle.name}".\n\nElige la carpeta que contiene los años (2026, 2025…):\n${NSF_FOLDER_HINT}`,
    );
    return false;
  }
  await idbSet(handle);
  return true;
}

type NsfDir = FileSystemDirectoryHandle & {
  queryPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
};

const HELPER = "http://127.0.0.1:47321";
const HELPER_MARK = "__rcHelper";

/** Ayudante local (tools/onedrive-helper): guarda en OneDrive sin pedir nada. */
async function helperUp() {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(`${HELPER}/ping`, { signal: ctrl.signal });
    window.clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** Carpeta del año en curso. Si no existe (por ejemplo 2027), la crea. */
export async function yearFolderForExport(): Promise<FileSystemDirectoryHandle | null> {
  if (await helperUp()) return { [HELPER_MARK]: true, name: String(new Date().getFullYear()) } as unknown as FileSystemDirectoryHandle;
  const saved = (await idbGet().catch(() => null)) as NsfDir | null;
  if (!saved) return null;
  try {
    let perm: PermissionState = "prompt";
    if (saved.queryPermission) perm = await saved.queryPermission({ mode: "readwrite" });
    if (perm !== "granted" && saved.requestPermission) perm = await saved.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return null;
    const year = String(new Date().getFullYear());
    return await saved.getDirectoryHandle(year, { create: true });
  } catch {
    await idbClear().catch(() => {});
    return null;
  }
}

export async function writeExportFile(dir: FileSystemDirectoryHandle, filename: string, data: Blob) {
  if ((dir as unknown as Record<string, unknown>)[HELPER_MARK]) {
    let r: Response;
    try {
      r = await fetch(`${HELPER}/save?name=${encodeURIComponent(filename)}`, { method: "POST", body: data });
    } catch {
      throw new Error("No se pudo comunicar con el ayudante de OneDrive. Revisa que esté activo.");
    }
    const j = (await r.json().catch(() => null)) as { ok?: boolean; size?: number; error?: string } | null;
    if (!r.ok || !j?.ok) throw new Error(`OneDrive no recibió el archivo${j?.error ? `: ${j.error}` : ""}.`);
    if (j.size !== data.size) throw new Error("El archivo se guardó incompleto en OneDrive. Vuelve a exportar.");
    return;
  }
  const file = await dir.getFileHandle(filename, { create: true });
  const writer = await file.createWritable();
  await writer.write(data);
  await writer.close();
  const saved = await file.getFile();
  if (saved.size !== data.size) throw new Error("El archivo se guardó incompleto en la carpeta. Vuelve a exportar.");
}

export class OutboxPendingError extends Error {
  constructor() {
    super("PENDING_PC");
    this.name = "OutboxPendingError";
  }
}

/**
 * Desde el celular no hay carpeta de OneDrive. El archivo se sube a la nube y
 * la computadora (con el ayudante activo) lo copia a la carpeta del año.
 * No resuelve hasta que el archivo está en esa carpeta.
 */
export async function sendToOneDriveViaPc(
  filename: string,
  data: Blob,
  onTick?: (msg: string) => void,
  waitMs = 28000,
): Promise<{ file: string }> {
  onTick?.("Enviando a tu computadora…");
  const start = await fetch("/api/nsf-outbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: filename, size: data.size }),
  });
  const created = (await start.json().catch(() => null)) as { id?: string; signedUrl?: string; error?: string } | null;
  if (!start.ok || !created?.id || !created.signedUrl) {
    throw new Error(created?.error || "No se pudo preparar el envío a OneDrive");
  }
  const up = await fetch(created.signedUrl, {
    method: "PUT",
    headers: { "content-type": data.type || "application/octet-stream" },
    body: data,
  });
  if (!up.ok) throw new Error("No se pudo enviar el archivo");
  const ready = await fetch("/api/nsf-outbox/ready", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: created.id }),
  });
  const readyBody = (await ready.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!ready.ok || !readyBody?.ok) throw new Error(readyBody?.error || "El archivo no llegó completo");

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    onTick?.("Guardando en la carpeta de OneDrive de tu computadora…");
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(`/api/nsf-outbox?id=${encodeURIComponent(created.id)}`);
    const j = (await g.json().catch(() => null)) as { status?: string; file?: string; size?: number; error?: string } | null;
    if (j?.status === "saved") {
      if (j.size !== data.size) throw new Error("El archivo se guardó incompleto en OneDrive. Vuelve a exportar.");
      return { file: j.file || filename };
    }
    if (j?.status === "error") throw new Error(j.error || "La computadora no pudo guardarlo en OneDrive");
  }
  throw new OutboxPendingError();
}

/** Celular o tablet: sin ayudante ni selector de carpetas. */
export function isMobileExport() {
  if (typeof window === "undefined") return false;
  /* Los Chrome nuevos de Android ya tienen selector de carpetas, por eso se detecta por dispositivo táctil. */
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|SM-|Tablet/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && window.matchMedia?.("(pointer: coarse)").matches) return true;
  return typeof (window as PickerWindow).showDirectoryPicker !== "function";
}

/** Entrega los archivos con la hoja nativa de compartir (Archivos, OneDrive, Drive…). Devuelve false si se canceló. */
export async function deliverOnDevice(files: { filename: string; blob: Blob }[]): Promise<"shared" | "downloaded" | "cancelled"> {
  const list = files.map((f) => new File([f.blob], f.filename, { type: f.blob.type || "application/pdf" }));
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: list })) {
    try {
      await nav.share({ files: list, title: list.length === 1 ? list[0].name : `${list.length} archivos` });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      /* sin permiso de compartir (pasó mucho tiempo): se descarga abajo */
    }
  }
  for (const f of list) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    await new Promise((r) => setTimeout(r, 400));
    URL.revokeObjectURL(url);
  }
  return "downloaded";
}

export function exportYear() {
  return new Date().getFullYear();
}
