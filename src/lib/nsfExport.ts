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

/** Carpeta del año en curso. Si no existe (por ejemplo 2027), la crea. */
export async function yearFolderForExport(): Promise<FileSystemDirectoryHandle | null> {
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
  const file = await dir.getFileHandle(filename, { create: true });
  const writer = await file.createWritable();
  await writer.write(data);
  await writer.close();
}

export function exportYear() {
  return new Date().getFullYear();
}
