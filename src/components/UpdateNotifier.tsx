"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isStaleBuildError, recoverApp } from "@/lib/recoverApp";

const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_INTERVAL = 4 * 60 * 1000; // 4 minutes

type Phase = "idle" | "available" | "updating";

export default function UpdateNotifier() {
  const [phase,    setPhase]    = useState<Phase>("idle");
  const snoozeUntilRef = useRef(0);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Si tras una actualización quedaron archivos viejos, se limpia y recarga solo (sin pantalla en blanco).
  useEffect(() => {
    const onErr = (e: ErrorEvent) => { if (isStaleBuildError(e.error ?? e.message)) void recoverApp(); };
    const onRej = (e: PromiseRejectionEvent) => { if (isStaleBuildError(e.reason)) void recoverApp(); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

  // ── Poll for new version ─────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/version?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const server: string = data?.v ?? "";
        if (server && server !== CLIENT_BUILD && Date.now() >= snoozeUntilRef.current) {
          setPhase(p => p === "updating" ? p : "available");
        }
      } catch { /* ignore */ }
    }

    // First check: 10 seconds after mount
    const first = setTimeout(check, 10_000);
    // Then every 4 minutes
    const interval = setInterval(check, POLL_INTERVAL);
    // También al volver a la app (cambiar de pestaña / ventana), máx. 1 vez cada 20 s.
    let lastFocusCheck = 0;
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFocusCheck < 20_000) return;
      lastFocusCheck = Date.now();
      void check();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);

  // ── Actualizar: breve animación y recarga limpia ─────────────────────────
  function startUpdate() {
    setPhase("updating");
    window.setTimeout(() => { void recoverApp(true); }, 900);
  }

  // "Luego": se vuelve a avisar en 30 minutos.
  function later() {
    snoozeUntilRef.current = Date.now() + 30 * 60 * 1000;
    setPhase("idle");
  }

  if (!mounted || phase === "idle") return null;

  const LIME = "#a3e635";
  const font = "inherit";

  return createPortal(
    <>
      <style>{`
        @keyframes rcu-up { from { opacity: 0; transform: translate(-50%, 24px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        @keyframes rcu-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rcu-pop { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes rcu-spin { to { transform: rotate(360deg); } }
        @keyframes rcu-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes rcu-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(163,230,53,.55); } 70% { box-shadow: 0 0 0 10px rgba(163,230,53,0); } }
        .rcu-btn { transition: transform .15s ease, filter .15s ease, background .15s ease; }
        .rcu-btn:hover { filter: brightness(1.06); }
        .rcu-btn:active { transform: scale(.97); }
        .rcu-ghost:hover { background: rgba(255,255,255,.1) !important; }
      `}</style>

      {phase === "available" ? (
        /* ── Aviso flotante (no bloquea la pantalla) ── */
        <div
          role="dialog"
          aria-live="polite"
          style={{
            position: "fixed", left: "50%", bottom: "max(110px, calc(env(safe-area-inset-bottom) + 100px))", zIndex: 999999,
            width: "min(440px, calc(100vw - 32px))",
            transform: "translateX(-50%)",
            animation: "rcu-up .45s cubic-bezier(.16,1,.3,1) both",
            fontFamily: font,
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "14px 14px 14px 16px",
            borderRadius: "22px",
            background: "rgba(17,19,24,.92)",
            backdropFilter: "blur(18px) saturate(1.4)",
            WebkitBackdropFilter: "blur(18px) saturate(1.4)",
            border: "1px solid rgba(255,255,255,.1)",
            boxShadow: "0 24px 60px -12px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
            color: "#f4f4f5",
          }}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "14px", flexShrink: 0,
              display: "grid", placeItems: "center",
              background: LIME, color: "#1a2e05",
              animation: "rcu-glow 2.2s ease-out infinite",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.25 }}>
                Nueva versión lista
              </div>
              <div style={{ fontSize: "12px", color: "#a1a1aa", marginTop: "2px", lineHeight: 1.35 }}>
                Se actualiza en segundos. No pierdes nada.
              </div>
            </div>
            <button
              type="button"
              onClick={later}
              className="rcu-btn rcu-ghost"
              style={{
                height: "38px", padding: "0 12px", borderRadius: "12px", flexShrink: 0,
                border: "none", background: "transparent", color: "#a1a1aa",
                fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: font,
              }}
            >
              Luego
            </button>
            <button
              type="button"
              onClick={startUpdate}
              className="rcu-btn"
              style={{
                height: "38px", padding: "0 16px", borderRadius: "12px", flexShrink: 0,
                border: "none", background: LIME, color: "#1a2e05",
                fontSize: "13px", fontWeight: 800, cursor: "pointer", fontFamily: font,
              }}
            >
              Actualizar
            </button>
          </div>
        </div>
      ) : (
        /* ── Actualizando ── */
        <div style={{
          position: "fixed", inset: 0, zIndex: 999999,
          display: "grid", placeItems: "center", padding: "16px",
          background: "rgba(9,9,11,.55)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          animation: "rcu-fade .2s ease both",
          fontFamily: font,
        }}>
          <div style={{
            width: "min(300px, 100%)", padding: "26px 24px 22px", borderRadius: "24px",
            background: "rgba(17,19,24,.96)", border: "1px solid rgba(255,255,255,.1)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,.7)",
            color: "#f4f4f5", textAlign: "center",
            animation: "rcu-pop .3s cubic-bezier(.16,1,.3,1) both",
          }}>
            <div style={{
              width: "46px", height: "46px", margin: "0 auto 16px", borderRadius: "50%",
              border: "3px solid rgba(163,230,53,.18)", borderTopColor: LIME,
              animation: "rcu-spin .8s linear infinite",
            }} />
            <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-.01em" }}>Actualizando…</div>
            <div style={{ fontSize: "12px", color: "#a1a1aa", marginTop: "4px" }}>Un momento, ya casi.</div>
            <div style={{ height: "4px", marginTop: "18px", borderRadius: "999px", background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", background: LIME, borderRadius: "999px", transformOrigin: "left", animation: "rcu-bar .9s cubic-bezier(.4,0,.2,1) both" }} />
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
