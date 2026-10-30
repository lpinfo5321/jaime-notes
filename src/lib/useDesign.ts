"use client";

import { useSyncExternalStore } from "react";

/**
 * Diseño (estructura) activo. Solo se cambia desde el selector de local;
 * en producción siempre será "classic" hasta que se elija uno definitivo.
 */
export type Design = "classic" | "panel" | "bento";

const EVENT = "rc:designChanged";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function getSnapshot(): Design {
  const v = document.documentElement.getAttribute("data-design");
  return v === "panel" || v === "bento" ? v : "classic";
}

export function setDesign(d: Design) {
  document.documentElement.setAttribute("data-design", d);
  try { localStorage.setItem("rc:design", d); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useDesign(): Design {
  return useSyncExternalStore(subscribe, getSnapshot, () => "classic" as Design);
}
