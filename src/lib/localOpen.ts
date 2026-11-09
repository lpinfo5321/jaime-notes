import { showDialog } from "./exportDialog";
import type { ExportedFile } from "./nsfExport";

/**
 * Abrir los PDF en el Explorador de OTRA computadora que también tiene OneDrive.
 * La app pide permiso una vez; el permiso es un instalador pequeño (public/permiso/ReturnChecks-Permiso.exe,
 * hecho con tools/permiso-carpetas) que registra el enlace rcopen: solo para ese usuario de Windows.
 * Al terminar abre /permiso-carpetas?ok=1, que marca esta computadora como lista.
 */
export const LOCAL_KEY = "rc:openLocal:v2";
const ASKED_KEY = "rc:openLocal:asked:v2";
export const PERMISO_EXE = "/permiso/ReturnChecks-Permiso.exe";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Computadora con Windows (no celular ni Mac): ahí sí se puede dar el permiso. */
export function isWindowsPc() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Windows NT/i.test(ua) && !/Mobile|Phone/i.test(ua);
}
export const hasLocalPermission = () => get(LOCAL_KEY) === "1";
export const localPermissionAsked = () => get(ASKED_KEY) === "1";

export function openLocalFolder(file?: ExportedFile, year?: number) {
  const y = file?.year ?? year ?? new Date().getFullYear();
  // escape(): mismo formato que Unescape() de Windows Script (acentos y Ñ incluidos)
  const a = document.createElement("a");
  a.href = `rcopen:${y}${file ? `/${escape(file.name)}` : ""}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const FOLDER_ICO =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';
const CHECK_ICO =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/**
 * Pide permiso para abrir las carpetas en esta computadora.
 * true = ya tiene permiso y la persona tocó "Abrir carpeta" (se puede abrir ya).
 */
export async function askLocalPermission(fromMenu = false): Promise<boolean> {
  const first = showDialog({
    icon: FOLDER_ICO,
    title: hasLocalPermission() ? "Esta computadora ya tiene permiso" : "¿Abrir los PDF en esta computadora?",
    detail: hasLocalPermission()
      ? "Los PDF se abren en la carpeta de OneDrive de esta computadora. Si dejó de funcionar, puedes volver a dar el permiso."
      : "Si esta computadora tiene OneDrive, Return Checks puede abrir los PDF directo en tu carpeta, igual que en la oficina. Solo hay que dar permiso una vez.",
    buttons: [
      { id: "no", label: fromMenu ? "Cancelar" : "Ahora no", tone: "plain" },
      { id: "yes", label: hasLocalPermission() ? "Dar permiso otra vez" : "Dar permiso", tone: "primary" },
    ],
  });
  const answer = await first.result;
  if (answer !== "yes") {
    if (!fromMenu) set(ASKED_KEY, "1");
    return false;
  }
  set(ASKED_KEY, "1");

  // Descargar el instalador
  const a = document.createElement("a");
  a.href = PERMISO_EXE;
  a.download = "ReturnChecks-Permiso.exe";
  document.body.appendChild(a);
  a.click();
  a.remove();

  const wasSet = hasLocalPermission();
  const wait = showDialog({
    icon: FOLDER_ICO,
    title: "Abre el archivo que se descargó",
    detail:
      "1) Abre \"ReturnChecks-Permiso.exe\" (abajo o arriba en el navegador, en Descargas). " +
      "2) Si Windows muestra \"Windows protegió tu PC\": toca Más información y luego Ejecutar de todas formas. " +
      "3) Toca Sí. Esta ventana se cierra sola cuando termine.",
    buttons: [
      { id: "cancel", label: "Cancelar", tone: "plain" },
      { id: "done", label: "Ya lo instalé", tone: "primary" },
    ],
  });
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_KEY && e.newValue === "1") wait.close("done");
  };
  window.addEventListener("storage", onStorage);
  const tick = window.setInterval(() => {
    if (!wasSet && hasLocalPermission()) wait.close("done");
  }, 1000);
  const res = await wait.result;
  window.removeEventListener("storage", onStorage);
  window.clearInterval(tick);
  if (res !== "done") return false;
  set(LOCAL_KEY, "1");

  const ok = await showDialog({
    icon: CHECK_ICO,
    title: "¡Listo! Ya tienes permiso",
    detail:
      "Desde ahora los PDF se abren en la carpeta de OneDrive de esta computadora. La primera vez el navegador te pregunta: marca \"Permitir siempre\" y toca Abrir.",
    buttons: [{ id: "open", label: fromMenu ? "Entendido" : "Abrir carpeta", tone: "primary" }],
  }).result;
  return ok === "open" && !fromMenu;
}
