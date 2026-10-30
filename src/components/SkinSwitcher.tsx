"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { setDesign, useDesign, type Design } from "@/lib/useDesign";

/**
 * Selector de DISEÑO + COLOR, SOLO PARA VER PROPUESTAS EN LOCAL.
 * No se renderiza en producción (NODE_ENV === "production").
 */
const DESIGNS: { id: Design; name: string; hint: string; icon: string }[] = [
  { id: "classic", name: "Clásico", hint: "Tarjetas como antes", icon: "▦" },
  { id: "panel",   name: "Panel",   hint: "Menú lateral + tabla + KPIs", icon: "☰" },
  { id: "bento",   name: "Bento",   hint: "Resumen grande + tarjetas mixtas", icon: "◨" },
];

const SKINS = [
  { id: "aurora",   name: "Lima",     dot: "linear-gradient(135deg,#a3e635,#22c55e)" },
  { id: "midnight", name: "Neón",     dot: "linear-gradient(135deg,#8b5cf6,#22d3ee)" },
  { id: "minimal",  name: "Azul",     dot: "linear-gradient(135deg,#18181b,#2563eb)" },
  { id: "warm",     name: "Cálido",   dot: "linear-gradient(135deg,#fb923c,#fcd34d)" },
] as const;

const KEY = "rc:skin";

export default function SkinSwitcher() {
  const [skin, setSkin] = useState<string>("aurora");
  const [open, setOpen] = useState(true);
  const design = useDesign();

  const { setTheme } = useTheme();

  useEffect(() => {
    try {
      // Atajos por URL (útil para capturas): ?design=bento&skin=midnight&theme=dark&panel=0
      const sp = new URLSearchParams(window.location.search);
      const qSkin = sp.get("skin");
      const qDesign = sp.get("design");
      const qTheme = sp.get("theme");
      if (sp.get("panel") === "0") {
        setOpen(false);
        // para capturas: oculta el aviso de "instalar app"
        const st = document.createElement("style");
        st.textContent = '[class*="z-[99999]"]{display:none!important}';
        document.head.appendChild(st);
      }
      if (qTheme === "dark" || qTheme === "light") setTheme(qTheme);

      const saved = qSkin ?? localStorage.getItem(KEY);
      if (saved && SKINS.some((s) => s.id === saved)) setSkin(saved);
      const d = (qDesign ?? localStorage.getItem("rc:design")) as Design | null;
      setDesign(d === "classic" || d === "panel" || d === "bento" ? d : "panel");
    } catch {
      setDesign("panel");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-skin", skin);
    try { localStorage.setItem(KEY, skin); } catch {}
  }, [skin]);

  if (process.env.NODE_ENV === "production") return null;

  const label: React.CSSProperties = {
    fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.55, fontWeight: 700, padding: "6px 6px 4px",
  };

  return (
    <div
      data-skin-switcher
      style={{ position: "fixed", right: 12, bottom: 12, zIndex: 2147483000, fontFamily: "system-ui, sans-serif" }}
    >
      {open ? (
        <div
          style={{
            background: "rgba(10,12,20,0.94)", color: "#fff", borderRadius: 18, padding: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.12)",
            backdropFilter: "blur(12px)", width: 236,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px" }}>
            <b style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.8 }}>🎨 Probar diseños</b>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimizar"
              style={{ background: "none", border: 0, color: "#fff", opacity: 0.6, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>–</button>
          </div>

          <div style={label}>Diseño</div>
          {DESIGNS.map((d) => {
            const on = d.id === design;
            return (
              <button key={d.id} type="button" onClick={() => setDesign(d.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  padding: "8px 10px", borderRadius: 12, cursor: "pointer", color: "#fff", marginBottom: 2,
                  border: on ? "1px solid rgba(255,255,255,.55)" : "1px solid transparent",
                  background: on ? "rgba(255,255,255,.16)" : "transparent",
                }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", fontSize: 14, flex: "none" }}>{d.icon}</span>
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                  <b style={{ fontSize: 13 }}>{d.name}</b>
                  <small style={{ fontSize: 11, opacity: 0.6 }}>{d.hint}</small>
                </span>
              </button>
            );
          })}

          <div style={label}>Color</div>
          <div style={{ display: "flex", gap: 6, padding: "0 4px 4px" }}>
            {SKINS.map((s) => {
              const on = s.id === skin;
              return (
                <button key={s.id} type="button" onClick={() => setSkin(s.id)} title={s.name}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0",
                    borderRadius: 12, cursor: "pointer", color: "#fff", fontSize: 10.5, fontWeight: 600,
                    border: on ? "1px solid rgba(255,255,255,.55)" : "1px solid transparent",
                    background: on ? "rgba(255,255,255,.16)" : "transparent",
                  }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: s.dot }} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          style={{
            background: "rgba(10,12,20,0.94)", color: "#fff", border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}>
          🎨 Diseños
        </button>
      )}
    </div>
  );
}
