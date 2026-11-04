"use client";
import type { SyntheticEvent } from "react";

/** Reintenta una portada que no cargó (red lenta / URL firmada vencida); si sigue fallando pide URLs nuevas. */
export function onCoverError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const tries = Number(img.dataset.retry || 0);
  const base = img.src;
  if (!base || base.startsWith("data:") || base.startsWith("blob:")) return;
  if (tries < 2) {
    img.dataset.retry = String(tries + 1);
    window.setTimeout(() => {
      img.src = base + (base.includes("?") ? "&" : "?") + "_r=" + (tries + 1) + Date.now();
    }, 900 * (tries + 1));
  } else if (tries === 2) {
    img.dataset.retry = "3";
    window.dispatchEvent(new Event("rc:cover-expired"));
  }
}
