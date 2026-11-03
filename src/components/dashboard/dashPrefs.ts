"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** design: 0 = clásico (anterior), 6 = carpeta kraft + libreta, 8 = carpeta + nota adhesiva */
export type DashPrefs = {
  design: 0 | 6 | 8;
  pal: string;
  hdr: number; // 1..7
  bg: number; // 0..5
};

export const DASH_DEFAULTS: DashPrefs = { design: 8, pal: "blue", hdr: 1, bg: 0 };

export const PAL_LIST: { id: string; name: string; sw: string; page: string }[] = [
  { id: "blue", name: "Azul", sw: "#0a84ff", page: "#f2f2f7" },
  { id: "ink", name: "Negro + lima", sw: "#1c1c1e", page: "#ffffff" },
  { id: "green", name: "Verde", sw: "#12b76a", page: "#f2f6f3" },
  { id: "orange", name: "Naranja", sw: "#ff7a1a", page: "#f7f3ef" },
  { id: "violet", name: "Violeta", sw: "#7c4dff", page: "#f3f1fa" },
  { id: "red", name: "Rojo", sw: "#ff3b30", page: "#f6f3f3" },
  { id: "pink", name: "Rosa", sw: "#ff2d8a", page: "#f8f1f4" },
  { id: "teal", name: "Turquesa", sw: "#00b8d9", page: "#f0f6f7" },
  { id: "yellow", name: "Amarillo", sw: "#ffd60a", page: "#f8f7f1" },
  { id: "night", name: "Noche", sw: "#000000", page: "#000000" },
];

export const HDR_NAMES = ["Bloque de color", "Título grande", "Bento", "Compacto", "Negro con total", "Dividido", "Total gigante"];
export const BG_NAMES = ["Sin texto de fondo", "Fila de contorno", "Dos filas", "Palabra gigante", "Montos", "Relleno de acento"];

const KEY = "rc:dash:v2";
let cache: DashPrefs | null = null;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): DashPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const design = o.design === 0 || o.design === 6 || o.design === 8 ? o.design : DASH_DEFAULTS.design;
  const pal = typeof o.pal === "string" && PAL_LIST.some((p) => p.id === o.pal) ? o.pal : DASH_DEFAULTS.pal;
  const hdr = typeof o.hdr === "number" && o.hdr >= 1 && o.hdr <= 7 ? Math.floor(o.hdr) : DASH_DEFAULTS.hdr;
  const bg = typeof o.bg === "number" && o.bg >= 0 && o.bg <= 5 ? Math.floor(o.bg) : DASH_DEFAULTS.bg;
  return { design: design as DashPrefs["design"], pal, hdr, bg };
}

function read(): DashPrefs {
  if (cache) return cache;
  let parsed: unknown = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch {
    // ignore
  }
  cache = sanitize(parsed);
  return cache;
}

export function setDashPrefs(patch: Partial<DashPrefs>) {
  cache = sanitize({ ...read(), ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDashPrefs(): DashPrefs {
  return useSyncExternalStore(subscribe, read, () => DASH_DEFAULTS);
}

/** Colores de la barra superior fuera del panel principal. */
export function palBar(id: string): { bar: string; fg: string } {
  if (id === "night") return { bar: "#000000", fg: "#ffffff" };
  if (id === "yellow") return { bar: "#ffd60a", fg: "#111111" };
  const pal = PAL_LIST.find((p) => p.id === id) ?? PAL_LIST[0];
  return { bar: pal.sw, fg: "#ffffff" };
}

let settingsNode: ReactNode = null;
const settingsListeners = new Set<() => void>();

export function setDashSettingsNode(node: ReactNode) {
  settingsNode = node;
  settingsListeners.forEach((l) => l());
}

export function useDashSettingsNode(): ReactNode {
  return useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    () => settingsNode,
    () => null,
  );
}
