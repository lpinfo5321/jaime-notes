"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** design: 0 = clásico (anterior), 6 = carpeta kraft + libreta, 8 = carpeta + nota adhesiva */
export type DashPrefs = {
  design: 0 | 6 | 8;
  pal: string;
  hdr: number; // 1..7
  bg: number; // 0..5
  /** big = nota grande al lado, tab = pestaña lateral, peek = asoma detrás de la carpeta */
  notes: "big" | "tab" | "peek";
};

export const DASH_DEFAULTS: DashPrefs = { design: 8, pal: "blue", hdr: 1, bg: 0, notes: "big" };

/** grad = paleta moderna con degradado (ids "m-…"). */
export const PAL_LIST: { id: string; name: string; sw: string; page: string; grad?: string }[] = [
  { id: "m-aurora", name: "Aurora", sw: "#7c3aed", page: "#f5f4fb", grad: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)" },
  { id: "m-ocean", name: "Océano", sw: "#2563eb", page: "#eef3fb", grad: "linear-gradient(135deg,#06b6d4 0%,#2563eb 55%,#4f46e5 100%)" },
  { id: "m-sunset", name: "Atardecer", sw: "#f43f5e", page: "#fbf3f1", grad: "linear-gradient(135deg,#f97316 0%,#f43f5e 55%,#d946ef 100%)" },
  { id: "m-mint", name: "Menta", sw: "#0d9488", page: "#eef7f4", grad: "linear-gradient(135deg,#10b981 0%,#0d9488 55%,#0891b2 100%)" },
  { id: "m-graphite", name: "Grafito", sw: "#1e293b", page: "#f1f4f8", grad: "linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#475569 100%)" },
  { id: "m-lavender", name: "Lavanda", sw: "#7c6cf0", page: "#f6f5fe", grad: "linear-gradient(135deg,#a78bfa 0%,#818cf8 50%,#60a5fa 100%)" },
  { id: "m-berry", name: "Mora", sw: "#a21caf", page: "#faf3f8", grad: "linear-gradient(135deg,#7e22ce 0%,#a21caf 50%,#db2777 100%)" },
  { id: "m-mocha", name: "Mocha", sw: "#8b5a3c", page: "#f6f1ec", grad: "linear-gradient(135deg,#b07a52 0%,#8b5a3c 55%,#5c3a26 100%)" },
  { id: "m-sage", name: "Salvia", sw: "#4d7c63", page: "#f1f4ef", grad: "linear-gradient(135deg,#84a98c 0%,#52796f 55%,#354f52 100%)" },
  { id: "blue", name: "Azul", sw: "#0a84ff", page: "#f2f2f7" },
  { id: "ink", name: "Negro + lima", sw: "#1c1c1e", page: "#ffffff" },
  { id: "green", name: "Verde", sw: "#12b76a", page: "#f2f6f3" },
  { id: "orange", name: "Naranja", sw: "#ff7a1a", page: "#f7f3ef" },
  { id: "violet", name: "Violeta", sw: "#7c4dff", page: "#f3f1fa" },
  { id: "red", name: "Rojo", sw: "#ff3b30", page: "#f6f3f3" },
  { id: "pink", name: "Rosa", sw: "#ff2d8a", page: "#f8f1f4" },
  { id: "teal", name: "Turquesa", sw: "#00b8d9", page: "#f0f6f7" },
  { id: "yellow", name: "Amarillo", sw: "#ffd60a", page: "#f8f7f1" },
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
  const notes = o.notes === "tab" || o.notes === "peek" ? o.notes : "big";
  return { design: design as DashPrefs["design"], pal, hdr, bg, notes };
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
export function palBar(id: string): { bar: string; fg: string; bg: string } {
  if (id === "yellow") return { bar: "#ffd60a", fg: "#111111", bg: "#ffd60a" };
  const pal = PAL_LIST.find((p) => p.id === id) ?? PAL_LIST[0];
  return { bar: pal.sw, fg: "#ffffff", bg: pal.grad ?? pal.sw };
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
