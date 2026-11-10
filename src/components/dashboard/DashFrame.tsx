"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import "./dashboard.css";
import { PAL_LIST, palBar, setDashSettingsNode, useDashPrefs } from "./dashPrefs";
import { DashSettingsPanel } from "./DashboardV2";

/** Mantiene el color, la barra y el botón de estilo en todas las pantallas de la app. */
export default function DashFrame({ children }: { children: React.ReactNode }) {
  const prefs = useDashPrefs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.classList.remove("dash-on", "dash-night", "dash-scrolled", "dash-grad");
      ["--dash-page", "--dash-bar", "--dash-bar-bg", "--dash-bar-fg", "--dash-hfg", "--dash-hbg", "--dash-hdr-h"].forEach((k) =>
        root.style.removeProperty(k),
      );
    };
    if (prefs.design === 0) {
      clear();
      setDashSettingsNode(null);
      return;
    }
    const pal = PAL_LIST.find((p) => p.id === prefs.pal) ?? PAL_LIST[0];
    const bar = palBar(prefs.pal);
    root.classList.add("dash-on");
    root.classList.toggle("dash-night", prefs.pal === "night");
    root.style.setProperty("--dash-page", pal.page);
    root.style.setProperty("--dash-bar", bar.bar);
    root.style.setProperty("--dash-bar-bg", bar.bg);
    root.classList.toggle("dash-grad", !!pal.grad);
    root.style.setProperty("--dash-bar-fg", bar.fg);
    root.style.setProperty("--dash-hbg", bar.bar);
    root.style.setProperty("--dash-hfg", bar.fg);
    const header = document.querySelector<HTMLElement>("header.sticky");
    const measure = () => {
      if (header) root.style.setProperty("--dash-hdr-h", `${header.offsetHeight}px`);
    };
    measure();
    const ro = header ? new ResizeObserver(measure) : null;
    if (header) ro?.observe(header);
    setDashSettingsNode(
      <button
        type="button"
        className="dash-style-btn"
        onClick={() => setOpen(true)}
        title="Estilo del panel"
        aria-label="Estilo del panel"
      >
        <Palette className="h-[17px] w-[17px]" />
      </button>,
    );
    return () => {
      ro?.disconnect();
      setDashSettingsNode(null);
    };
  }, [prefs.design, prefs.pal]);

  return (
    <>
      {children}
      {open && prefs.design !== 0 ? <DashSettingsPanel prefs={prefs} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
