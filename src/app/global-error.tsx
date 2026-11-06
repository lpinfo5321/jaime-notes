"use client";

import { useEffect } from "react";
import { isStaleBuildError, recoverApp } from "@/lib/recoverApp";

/** Última red de seguridad: si algo revienta al cargar, se limpia y se recarga solo una vez. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    void recoverApp();
  }, [error]);
  void isStaleBuildError;
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafafa", color: "#18181b" }}>
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Actualizando la app…</h1>
            <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 18px" }}>Si no se abre sola en unos segundos, toca el botón.</p>
            <button
              type="button"
              onClick={() => { void recoverApp(true); }}
              style={{ background: "#059669", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Reintentar
            </button>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={reset} style={{ background: "none", border: 0, color: "#71717a", fontSize: 12, cursor: "pointer" }}>Probar sin recargar</button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
