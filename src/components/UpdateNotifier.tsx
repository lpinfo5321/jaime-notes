"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DISMISS_KEY = "rc:updateDismissed:v1";

type Phase = "idle" | "available" | "updating";

export default function UpdateNotifier() {
  const [phase, setPhase]       = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [step, setStep]         = useState(0); // 0=download 1=optimize 2=install
  const [mounted, setMounted]   = useState(false);
  const newBuildRef             = useRef<string>("");

  useEffect(() => { setMounted(true); }, []);

  // ── Poll for new version ──────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch("/api/version?t=" + Date.now(), { cache: "no-store" });
        const data = await res.json();
        const serverBuild: string = data?.v ?? "";
        if (serverBuild && serverBuild !== CLIENT_BUILD) {
          // Check if user already dismissed this specific version
          try {
            const dismissed = sessionStorage.getItem(DISMISS_KEY);
            if (dismissed === serverBuild) return;
          } catch {}
          newBuildRef.current = serverBuild;
          setPhase("available");
        }
      } catch {
        // Network error — silently ignore
      }
    }

    // First check after 30 s (let app settle)
    const first = setTimeout(check, 30_000);
    // Then poll every 5 minutes
    const interval = setInterval(check, POLL_INTERVAL);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  // ── Update animation then reload ──────────────────────────────────────────
  function startUpdate() {
    setPhase("updating");
    setProgress(0);
    setStep(0);

    let pct = 0;
    const tick = setInterval(() => {
      pct += Math.random() * 6 + 2;
      if (pct >= 100) pct = 100;
      setProgress(Math.round(pct));

      if (pct >= 40 && step < 1) setStep(1);
      if (pct >= 75 && step < 2) setStep(2);

      if (pct >= 100) {
        clearInterval(tick);
        setTimeout(() => window.location.reload(), 600);
      }
    }, 120);
  }

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, newBuildRef.current); } catch {}
    setPhase("idle");
  }

  if (!mounted || phase === "idle") return null;

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 999999,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      background: "rgba(15,23,42,0.35)",
      backdropFilter: "blur(6px)",
    }}>
      {phase === "available" ? (
        /* ── Available modal ── */
        <div style={{
          width: "100%", maxWidth: "380px",
          background: "white", borderRadius: "28px", overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)",
          animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
        }}>
          {/* Top accent */}
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          {/* Decorative blobs */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: "-40px", right: "-40px",
              width: "160px", height: "160px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />
          </div>

          <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
            {/* Icon */}
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
              background: "linear-gradient(90deg,#fef3c7,#fff)",
              border: "1px solid #fbbf24", borderRadius: "999px",
              padding: "3px 10px", fontSize: "11px", fontWeight: 800,
              color: "#92400e", marginBottom: "12px",
              letterSpacing: "0.3px",
            }}>
              ✦ NUEVA VERSIÓN
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              Nueva actualización<br />disponible
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b", lineHeight: 1.6 }}>
              Hay una nueva versión lista para instalar con mejoras de rendimiento y correcciones.
            </p>

            {/* Buttons */}
            <button
              onClick={startUpdate}
              style={{
                width: "100%", padding: "14px", marginBottom: "10px",
                borderRadius: "16px", border: "none",
                background: "linear-gradient(135deg,#ef4444,#dc2626)",
                color: "white", fontSize: "15px", fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(239,68,68,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Actualizar ahora
            </button>
            <button
              onClick={dismiss}
              style={{
                width: "100%", padding: "12px",
                borderRadius: "14px", border: "1.5px solid #e2e8f0",
                background: "white", color: "#64748b",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Más tarde
            </button>

            <p style={{ margin: "14px 0 0", fontSize: "11px", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Tu información está segura. No perderás ningún dato.
            </p>
          </div>
        </div>
      ) : (
        /* ── Progress modal ── */
        <div style={{
          width: "100%", maxWidth: "380px",
          background: "white", borderRadius: "28px", overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)",
          animation: "scale-in .25s cubic-bezier(.34,1.4,.64,1) both",
        }}>
          <div style={{ height: "4px", background: "linear-gradient(90deg,#f97316,#ef4444,#ec4899)" }} />

          <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
            {/* Circular progress */}
            <div style={{ position: "relative", width: "100px", height: "100px", margin: "0 auto 20px" }}>
              <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="50" cy="50" r="44" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="44" fill="none"
                  stroke="url(#progressGrad)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.15s ease" }}
                />
                <defs>
                  <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "22px", fontWeight: 900, color: "#0f172a",
              }}>
                {progress}%
              </div>
            </div>

            <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
              Actualizando aplicación
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
              Instalando la nueva versión. Esto tomará solo un momento.
            </p>

            {/* Steps */}
            <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
              {[
                { label: "Descargando archivos", pct: `${progress}%`, done: step > 0 },
                { label: "Optimizando datos",    pct: "En espera",    done: step > 1 },
                { label: "Finalizando instalación", pct: "En espera", done: false },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: i < step ? "#dcfce7" : i === step ? "#fef3c7" : "#f1f5f9",
                    fontSize: "12px",
                  }}>
                    {i < step ? "✓" : i === step ? "↓" : "○"}
                  </div>
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: i <= step ? "#1e293b" : "#94a3b8" }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: i === 0 ? "#ef4444" : "#94a3b8" }}>
                    {i === 0 ? `${progress}%` : i < step ? "Listo" : "En espera"}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: "11px", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontWeight: 600 }}>
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
