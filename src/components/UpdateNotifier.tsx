"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_INTERVAL = 4 * 60 * 1000; // 4 minutes

type Phase = "idle" | "available" | "updating";

export default function UpdateNotifier() {
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [step,     setStep]     = useState(0);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ── Poll for new version ─────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/version?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const server: string = data?.v ?? "";
        if (server && server !== CLIENT_BUILD) {
          setPhase(p => p === "updating" ? p : "available");
        }
      } catch { /* ignore */ }
    }

    // First check: 10 seconds after mount
    const first = setTimeout(check, 10_000);
    // Then every 4 minutes
    const interval = setInterval(check, POLL_INTERVAL);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  // ── Animated update then reload ──────────────────────────────────────────
  function startUpdate() {
    setPhase("updating");
    setProgress(0);
    setStep(0);

    let pct = 0;
    const tick = setInterval(() => {
      pct += Math.random() * 5 + 2;
      if (pct >= 100) pct = 100;
      const rounded = Math.round(pct);
      setProgress(rounded);
      if (pct >= 38) setStep(s => Math.max(s, 1));
      if (pct >= 72) setStep(s => Math.max(s, 2));
      if (pct >= 100) {
        clearInterval(tick);
        setTimeout(() => window.location.reload(), 700);
      }
    }, 110);
  }

  if (!mounted || phase === "idle") return null;

  return createPortal(
    /* Backdrop — NOT clickable to close */
    <div style={{
      position: "fixed", inset: 0, zIndex: 999999,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      background: "rgba(15,23,42,0.45)",
      backdropFilter: "blur(8px)",
    }}>
      {phase === "available" ? (
        /* ── Available modal ─────────────────────────────── */
        <div style={{
          width: "100%", maxWidth: "380px",
          background: "white", borderRadius: "28px", overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.1)",
          animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
        }}>
          {/* Top gradient bar */}
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
            {/* Logo container */}
            <div style={{
              width: "72px", height: "72px", borderRadius: "22px",
              background: "linear-gradient(135deg,#fff1f0,#ffe4e1)",
              border: "1.5px solid rgba(239,68,68,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 4px 16px rgba(239,68,68,0.12)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" style={{ width: "48px", height: "48px", borderRadius: "14px", objectFit: "contain" }} />
            </div>

            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              background: "linear-gradient(90deg,#fef3c7,#fffbeb)",
              border: "1px solid #fbbf24", borderRadius: "999px",
              padding: "3px 12px", fontSize: "11px", fontWeight: 800,
              color: "#92400e", marginBottom: "14px", letterSpacing: "0.4px",
            }}>
              ✦ NUEVA VERSIÓN DISPONIBLE
            </div>

            <h2 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 800, color: "#0f172a", lineHeight: 1.25 }}>
              Nueva actualización<br />disponible
            </h2>
            <p style={{ margin: "0 0 22px", fontSize: "13px", color: "#64748b", lineHeight: 1.65 }}>
              Hay una nueva versión lista para instalar con mejoras de rendimiento y correcciones.
            </p>

            {/* Actualizar */}
            <button onClick={startUpdate} style={{
              width: "100%", padding: "14px 20px", marginBottom: "10px",
              borderRadius: "16px", border: "none",
              background: "linear-gradient(135deg,#f97316,#ef4444)",
              color: "white", fontSize: "15px", fontWeight: 800, cursor: "pointer",
              boxShadow: "0 4px 20px rgba(239,68,68,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "opacity .15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = ".9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Actualizar ahora
            </button>

            <p style={{ margin: "12px 0 0", fontSize: "11px", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Tu información está segura. No perderás ningún dato.
            </p>
          </div>
        </div>
      ) : (
        /* ── Progress modal ──────────────────────────────── */
        <div style={{
          width: "100%", maxWidth: "380px",
          background: "white", borderRadius: "28px", overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.1)",
          animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
        }}>
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
            {/* Circular progress ring */}
            <div style={{ position: "relative", width: "108px", height: "108px", margin: "0 auto 20px" }}>
              <svg width="108" height="108" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="54" cy="54" r="46" fill="none" stroke="#f1f5f9" strokeWidth="9" />
                <circle cx="54" cy="54" r="46" fill="none"
                  stroke="url(#pg)" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 46}`}
                  strokeDashoffset={`${2 * Math.PI * 46 * (1 - progress / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.12s linear" }}
                />
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{progress}%</span>
              </div>
            </div>

            <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
              Actualizando aplicación
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
              Instalando la nueva versión. Esto tomará solo un momento.
            </p>

            {/* Step list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left", marginBottom: "18px" }}>
              {[
                { label: "Descargando archivos",    active: step === 0, done: step > 0 },
                { label: "Optimizando datos",       active: step === 1, done: step > 1 },
                { label: "Finalizando instalación", active: step === 2, done: false     },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "13px", fontWeight: 800,
                    background: s.done ? "#dcfce7" : s.active ? "#fff7ed" : "#f1f5f9",
                    color:      s.done ? "#16a34a" : s.active ? "#ea580c" : "#94a3b8",
                    border: s.active ? "2px solid #f97316" : "2px solid transparent",
                    transition: "all .3s",
                  }}>
                    {s.done ? "✓" : s.active ? "↓" : "○"}
                  </div>
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: (s.done || s.active) ? "#1e293b" : "#94a3b8" }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: s.active ? "#ef4444" : s.done ? "#16a34a" : "#94a3b8" }}>
                    {s.active ? `${progress}%` : s.done ? "✓ Listo" : "En espera"}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: "11px", color: "#ef4444", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              No cierres la app. Solo puede tomar unos segundos.
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
