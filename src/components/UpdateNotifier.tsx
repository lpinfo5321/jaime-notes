"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLIENT_BUILD   = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_MS        = 3 * 60 * 1000;   // poll every 3 minutes
const FIRST_CHECK_MS = 10_000;           // first check after 10 s
const PENDING_KEY    = "rc:updatePending:v1";   // sessionStorage: version available
const DISMISS_KEY    = "rc:updateDismissed:v1"; // sessionStorage: user dismissed version

type Phase = "idle" | "available" | "updating";

export default function UpdateNotifier() {
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [step,     setStep]     = useState(0);
  const [mounted,  setMounted]  = useState(false);
  const newBuildRef = useRef<string>("");

  useEffect(() => {
    setMounted(true);

    // On mount: re-show if a pending update was stored (survives soft-navs)
    try {
      const pending = sessionStorage.getItem(PENDING_KEY);
      if (pending && pending !== CLIENT_BUILD) {
        const dismissed = sessionStorage.getItem(DISMISS_KEY);
        if (dismissed !== pending) {
          newBuildRef.current = pending;
          setPhase("available");
          return; // no need to poll immediately
        }
      }
    } catch {}
  }, []);

  // ── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/version?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { v?: string };
        const serverBuild = data?.v ?? "";
        if (!serverBuild || serverBuild === CLIENT_BUILD) return;

        // Check if already dismissed this version
        const dismissed = sessionStorage.getItem(DISMISS_KEY);
        if (dismissed === serverBuild) return;

        // Persist pending update so it survives navigations
        sessionStorage.setItem(PENDING_KEY, serverBuild);
        newBuildRef.current = serverBuild;
        setPhase("available");
      } catch { /* offline – ignore */ }
    }

    const t1 = setTimeout(check, FIRST_CHECK_MS);
    const iv = setInterval(check, POLL_MS);
    return () => { clearTimeout(t1); clearInterval(iv); };
  }, []);

  // ── Start update animation then reload ───────────────────────────────────
  function startUpdate() {
    setPhase("updating");
    setProgress(0);
    setStep(0);

    let pct = 0;
    const tick = setInterval(() => {
      pct += Math.random() * 5 + 3;
      if (pct >= 100) pct = 100;
      const rounded = Math.round(pct);
      setProgress(rounded);
      if (pct >= 40) setStep(1);
      if (pct >= 75) setStep(2);
      if (pct >= 100) {
        clearInterval(tick);
        // Clear stored pending so it doesn't re-appear after reload
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
        setTimeout(() => window.location.reload(), 700);
      }
    }, 110);
  }

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, newBuildRef.current);
      sessionStorage.removeItem(PENDING_KEY);
    } catch {}
    setPhase("idle");
  }

  if (!mounted || phase === "idle") return null;

  return createPortal(
    /* Outer wrapper — pointer-events only on the card, not backdrop */
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 999999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        background: "rgba(15,23,42,0.4)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      /* backdrop click does nothing — must press a button */
    >
      {phase === "available" ? (
        /* ── Update available card ── */
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%", maxWidth: "370px",
            background: "#ffffff",
            borderRadius: "28px",
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.1)",
            animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
          }}
        >
          {/* Accent bar */}
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          <div style={{ padding: "28px 26px 24px", textAlign: "center" }}>
            {/* Logo */}
            <div style={{
              width: "68px", height: "68px", borderRadius: "20px",
              background: "linear-gradient(135deg,#fff1f0,#ffe4e1)",
              border: "1.5px solid rgba(239,68,68,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px",
              boxShadow: "0 4px 16px rgba(239,68,68,0.12)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" style={{ width: "46px", height: "46px", borderRadius: "12px", objectFit: "contain" }} />
            </div>

            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              background: "#fef3c7", border: "1px solid #fbbf24",
              borderRadius: "999px", padding: "3px 11px",
              fontSize: "11px", fontWeight: 800, color: "#92400e",
              marginBottom: "12px",
            }}>
              ✦ NUEVA VERSIÓN DISPONIBLE
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: "19px", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              Actualización lista
            </h2>
            <p style={{ margin: "0 0 22px", fontSize: "13px", color: "#64748b", lineHeight: 1.65 }}>
              Hay mejoras y correcciones listas para instalar.<br />
              Solo tomará unos segundos.
            </p>

            {/* Primary button */}
            <button
              onClick={startUpdate}
              style={{
                width: "100%", padding: "14px", marginBottom: "10px",
                borderRadius: "16px", border: "none",
                background: "linear-gradient(135deg,#ef4444,#dc2626)",
                color: "white", fontSize: "15px", fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "transform .15s, box-shadow .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(239,68,68,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(239,68,68,0.4)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Actualizar ahora
            </button>

            {/* Secondary link */}
            <button
              onClick={dismiss}
              style={{
                width: "100%", padding: "11px",
                borderRadius: "14px",
                border: "1.5px solid #e2e8f0",
                background: "white", color: "#94a3b8",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Más tarde
            </button>

            <p style={{
              margin: "14px 0 0", fontSize: "11px", color: "#cbd5e1",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Tu información está segura. No perderás ningún dato.
            </p>
          </div>
        </div>
      ) : (
        /* ── Progress card ── */
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: "370px",
            background: "#ffffff",
            borderRadius: "28px", overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.1)",
            animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
          }}
        >
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          <div style={{ padding: "28px 26px 24px", textAlign: "center" }}>
            {/* Circular progress */}
            <div style={{ position: "relative", width: "96px", height: "96px", margin: "0 auto 20px" }}>
              <svg width="96" height="96" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="7" />
                <circle
                  cx="48" cy="48" r="40" fill="none"
                  stroke="url(#grad1)" strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.12s ease" }}
                />
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px", fontWeight: 900, color: "#0f172a",
              }}>
                {progress}%
              </div>
            </div>

            <h2 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
              Actualizando aplicación
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
              Instalando la nueva versión. Solo un momento…
            </p>

            {/* Steps */}
            <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
              {[
                { label: "Descargando archivos" },
                { label: "Optimizando datos" },
                { label: "Finalizando instalación" },
              ].map((s, i) => {
                const done    = i < step;
                const active  = i === step;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: done ? "#dcfce7" : active ? "#fff7ed" : "#f1f5f9",
                      fontSize: "11px", fontWeight: 900,
                      color: done ? "#16a34a" : active ? "#ea580c" : "#94a3b8",
                    }}>
                      {done ? "✓" : active ? "↓" : "○"}
                    </div>
                    <span style={{
                      flex: 1, fontSize: "13px", fontWeight: 600,
                      color: i <= step ? "#1e293b" : "#94a3b8",
                    }}>
                      {s.label}
                    </span>
                    <span style={{
                      fontSize: "12px", fontWeight: 700,
                      color: active ? "#ef4444" : done ? "#22c55e" : "#94a3b8",
                    }}>
                      {done ? "Listo ✓" : active ? `${progress}%` : "En espera"}
                    </span>
                  </div>
                );
              })}
            </div>

            <p style={{
              margin: 0, fontSize: "11px", fontWeight: 700,
              color: "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              No cierres la app. Solo toma unos segundos.
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
