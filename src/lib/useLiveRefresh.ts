"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Mantiene una pantalla "al día" aunque se hayan perdido eventos en tiempo real.
 *
 * Por qué hace falta: en celulares/PWA, cuando la app se manda al fondo o se apaga la pantalla,
 * el WebSocket de Supabase Realtime se corta y los cambios hechos mientras tanto NUNCA llegan.
 * Esta función vuelve a pedir los datos cuando:
 *  - la app vuelve a estar visible / recupera el foco,
 *  - vuelve la conexión a internet,
 *  - llega un evento en tiempo real de la tabla indicada,
 *  - (respaldo) cada `pollMs` mientras la pantalla está visible.
 */
export function useLiveRefresh(
  refetch: () => void,
  opts: {
    /** Tabla de Supabase a escuchar en tiempo real (opcional). */
    table?: string;
    /** Poner en false para pausar (p. ej. mientras hay una ventana de edición abierta). */
    enabled?: boolean;
    /** Tiempo mínimo entre recargas (anti-spam). */
    minGapMs?: number;
    /** Respaldo por intervalo (0 = desactivado). */
    pollMs?: number;
  } = {},
) {
  const { table, enabled = true, minGapMs = 2000, pollMs = 60_000 } = opts;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const lastRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    let timer: number | null = null;
    const run = (force = false) => {
      if (!enabledRef.current) return;
      const now = Date.now();
      if (!force && now - lastRef.current < minGapMs) return;
      lastRef.current = now;
      try { refetchRef.current(); } catch {}
    };
    const runDebounced = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => run(), 400);
    };

    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    const onFocus = () => run();
    const onOnline = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    let poll: number | null = null;
    if (pollMs > 0) {
      poll = window.setInterval(() => {
        if (document.visibilityState === "visible" && navigator.onLine !== false) run();
      }, pollMs);
    }

    let cancelled = false;
    let channel: any = null;
    const supabase = table ? createClient() : null;
    if (supabase && table) {
      channel = supabase
        .channel(`live-${table}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          if (!cancelled) runDebounced();
        })
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (poll) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [table, minGapMs, pollMs]);
}
