"use client";

import { useEffect } from "react";
import { recoverApp } from "@/lib/recoverApp";

/** Una página que no existe dentro de la app casi siempre es una versión vieja guardada: se limpia y se vuelve al inicio. */
export default function NotFound() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/app")) void recoverApp(false, "/app");
  }, []);
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 340 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>No encontramos esta página</h1>
        <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 16px" }}>Te llevamos al inicio…</p>
        <a href="/app" style={{ background: "#059669", color: "#fff", borderRadius: 12, padding: "12px 20px", fontWeight: 700, textDecoration: "none" }}>Ir al inicio</a>
      </div>
    </div>
  );
}
