import { askExportChoice } from "./exportDialog";
import type { ExportedFile } from "./nsfExport";

/**
 * Abrir la carpeta de los PDF en el Explorador de OTRA computadora que también tiene el OneDrive.
 * Se instala una vez el archivo /abrir-carpeta/ReturnChecks-abrir-carpeta.cmd, que registra el
 * enlace rcopen: (solo abre cosas dentro de NSF CHECKS PDF FILES de esa computadora).
 */
const KEY = "rc:openLocal:v1";
export const LOCAL_INSTALLER = "/abrir-carpeta/ReturnChecks-abrir-carpeta.cmd";

export function localOpenChoice(): "local" | "web" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "local" || v === "web" ? v : null;
  } catch {
    return null;
  }
}

function setChoice(v: "local" | "web") {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

export function openLocalFolder(file?: ExportedFile, year?: number) {
  const y = file?.year ?? year ?? new Date().getFullYear();
  const a = document.createElement("a");
  a.href = `rcopen:${y}${file ? `/${encodeURIComponent(file.name)}` : ""}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Pregunta cómo abrir en esta computadora. Devuelve lo que eligió, o "cancel". */
export async function askLocalSetup(fromMenu = false): Promise<"local" | "web" | "cancel"> {
  const current = localOpenChoice();
  const choice = await askExportChoice({
    title: fromMenu ? "Abrir carpetas en esta computadora" : "¿Esta computadora tiene OneDrive?",
    detail:
      "Si aquí está la carpeta de OneDrive de La Primavera, los PDF se pueden abrir en el Explorador, igual que en la oficina. Solo hay que instalar un archivo pequeño una vez (no necesita administrador)." +
      (current === "local" ? " Ahora esta computadora abre en el Explorador." : current === "web" ? " Ahora esta computadora abre OneDrive en línea." : ""),
    buttons: [
      ...(fromMenu ? [{ id: "cancel", label: "Cancelar", tone: "plain" as const }] : []),
      { id: "web", label: "Usar OneDrive en línea", tone: "ghost" },
      { id: "local", label: current === "local" ? "Descargar de nuevo" : "Instalar en esta PC", tone: "primary" },
    ],
  });
  if (choice === "web") {
    setChoice("web");
    return "web";
  }
  if (choice !== "local") return "cancel";
  setChoice("local");
  const a = document.createElement("a");
  a.href = LOCAL_INSTALLER;
  a.download = "ReturnChecks-abrir-carpeta.cmd";
  document.body.appendChild(a);
  a.click();
  a.remove();
  await askExportChoice({
    title: "Se descargó el instalador",
    detail:
      "1) Abre el archivo descargado \"ReturnChecks-abrir-carpeta.cmd\" (si el navegador avisa, elige Conservar). " +
      "2) Si Windows dice \"Windows protegió tu PC\": Más información → Ejecutar de todas formas. " +
      "3) Vuelve a tocar el botón de carpeta. La primera vez el navegador pregunta: marca \"Permitir siempre\" y Abrir.",
    buttons: [{ id: "ok", label: "Entendido", tone: "primary" }],
  });
  return "local";
}
