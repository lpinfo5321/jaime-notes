"use client";

/**
 * Tutorial interactivo: oscurece la pantalla, ilumina cada parte de la app y explica para qué sirve.
 * - Sale solo la primera vez en cada equipo (localStorage).
 * - Se puede repetir desde el menú ⚙ → "Tutorial de la app" (evento "rc:startTour").
 * - Si una parte no está visible (otro diseño, celular), ese paso se salta o se muestra al centro.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export const TOUR_DONE_KEY = "rc:tour:v1:done";
export const TOUR_PENDING_KEY = "rc:tour:pending";

type Step = {
  /** Selectores CSS a iluminar (el primero visible). Sin selector = tarjeta al centro. */
  target?: string[];
  /** Si no se encuentra el elemento: saltar el paso (true) o mostrarlo al centro (false). */
  optional?: boolean;
  icon: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "👋",
    title: "Bienvenido a Return Checks",
    body: "Aquí se lleva el control de los cheques devueltos (NSF) de La Primavera. En un minuto te enseño lo básico. Usa Siguiente o las flechas del teclado.",
  },
  {
    target: [".kroot .kh"],
    optional: true,
    icon: "📊",
    title: "El resumen",
    body: "Arriba ves cuánto se debe en total (con fees incluidos), cuántos cheques faltan por cobrar y cuántas compañías hay.",
  },
  {
    target: [".kg .kc .kf"],
    optional: true,
    icon: "🗂️",
    title: "Cada compañía es un expediente",
    body: "Toca la tarjeta para abrir el reporte del cheque: fechas, monto, motivo, contactos y pagos. Lo que escribes se guarda solo.",
  },
  {
    target: [".kg .kc .kn"],
    optional: true,
    icon: "📝",
    title: "Notas de seguimiento",
    body: "En la libreta se apunta cada llamada o abono, con la fecha y el agente. Tócala para ver o agregar una nota.",
  },
  {
    target: [".kn-fab", '[data-hd="plus"]'],
    icon: "➕",
    title: "Registrar un cheque nuevo",
    body: "Con el botón + creas un reporte nuevo. Si la compañía ya existe, el cheque se agrega a su expediente. La comisión (fee) se calcula sola según el monto del cheque.",
  },
  {
    target: [".kn-bar"],
    optional: true,
    icon: "📁",
    title: "Pendientes, Completados y Papelera",
    body: "Cuando se cobran el cheque y la comisión, el reporte pasa a Completados. Lo que borras va a la Papelera, y de ahí se puede restaurar.",
  },
  {
    target: ['[data-hd="search"]'],
    optional: true,
    icon: "🔎",
    title: "Buscar",
    body: "Busca por compañía, cliente o teléfono. Cambia a PAY para buscar por quien hizo el cheque, o a Status para ver solo los de un estado de pago.",
  },
  {
    target: ['[data-hd="nav"]'],
    optional: true,
    icon: "🧭",
    title: "Más secciones",
    body: "Contactos: teléfonos de cada compañía. Docs: documentos guardados. Registro: la lista de todos los cheques (el Excel RETURNED CHECK LOG).",
  },
  {
    target: ['[data-hd="select"]'],
    optional: true,
    icon: "☑️",
    title: "Seleccionar varias",
    body: "Sirve para mover o borrar varias compañías a la vez.",
  },
  {
    target: ['[data-hd="menu"]'],
    optional: true,
    icon: "⚙️",
    title: "El menú",
    body: "Modo oscuro, herramientas y cerrar sesión. Desde aquí puedes volver a ver este tutorial cuando quieras.",
  },
  {
    icon: "📄",
    title: "Guardar el PDF",
    body: "Dentro del reporte, el botón verde Exportar guarda el PDF en la carpeta de OneDrive (NSF CHECKS PDF FILES). Desde el celular también funciona: la computadora de la tienda lo guarda cuando está prendida.",
  },
  {
    icon: "🎉",
    title: "¡Listo!",
    body: "Ya sabes lo básico. Si algún día te pierdes, abre el menú ⚙ y elige “Tutorial de la app”.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(step: Step): HTMLElement | null {
  for (const sel of step.target ?? []) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      if (r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none") return el;
    }
  }
  return null;
}

const LIME = "#a3e635";
const PAD = 8;

export default function AppTour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(1200);
  const [vh, setVh] = useState(800);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);
  const dirRef = useRef(1);

  useEffect(() => setMounted(true), []);

  const finish = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(TOUR_DONE_KEY, String(Date.now())); } catch {}
  }, []);

  const start = useCallback(() => {
    dirRef.current = 1;
    setI(0);
    setOpen(true);
  }, []);

  // Inicio: primera vez en este equipo, o pedido desde el menú (aunque se haya navegado a /app).
  useEffect(() => {
    if (pathname !== "/app") return;
    let pending = false;
    let done = false;
    try {
      pending = sessionStorage.getItem(TOUR_PENDING_KEY) === "1";
      if (pending) sessionStorage.removeItem(TOUR_PENDING_KEY);
      done = !!localStorage.getItem(TOUR_DONE_KEY);
    } catch {}
    if (!pending && done) return;
    const t = window.setTimeout(() => {
      // No interrumpir si hay una ventana abierta (reporte, aviso, etc.)
      if (!pending && document.querySelector('[role="dialog"], iframe[src*="appreporte"]')) return;
      start();
    }, pending ? 600 : 1800);
    return () => window.clearTimeout(t);
  }, [pathname, start]);

  useEffect(() => {
    const h = () => start();
    window.addEventListener("rc:startTour", h);
    return () => window.removeEventListener("rc:startTour", h);
  }, [start]);

  // Ubica el elemento del paso actual (saltando los que no existen en esta pantalla).
  const measure = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    const step = STEPS[i];
    if (!step?.target) { setRect(null); return; }
    const el = findTarget(step);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [i]);

  useEffect(() => {
    if (!open) return;
    const step = STEPS[i];
    if (step?.target) {
      const el = findTarget(step);
      if (!el && step.optional) {
        // saltar en la misma dirección
        const next = i + dirRef.current;
        if (next >= 0 && next < STEPS.length) setI(next);
        else finish();
        return;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        const fixed = window.getComputedStyle(el).position === "fixed" || !!el.closest(".kn-dock, header");
        if (!fixed && (r.top < 90 || r.bottom > window.innerHeight - 90)) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
    measure();
    const t1 = window.setTimeout(measure, 350);
    const t2 = window.setTimeout(measure, 700);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [open, i, measure, finish]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, i, rect]);

  const next = useCallback(() => {
    dirRef.current = 1;
    if (i >= STEPS.length - 1) finish();
    else setI(i + 1);
  }, [i, finish]);
  const back = useCallback(() => {
    dirRef.current = -1;
    if (i > 0) setI(i - 1);
  }, [i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!mounted || !open) return null;

  const step = STEPS[i];
  const total = STEPS.length;
  const isLast = i === total - 1;
  const mobile = vw < 640;
  const cardW = Math.min(360, vw - 32);

  // Posición de la tarjeta: debajo o arriba del elemento; al centro si no hay elemento.
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { left: Math.max(16, (vw - cardW) / 2), top: Math.max(16, (vh - cardH) / 2) };
  } else if (mobile) {
    const below = rect.top + rect.height / 2 < vh / 2;
    cardStyle = below
      ? { left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))" }
      : { left: 16, right: 16, top: 16 };
  } else {
    const spaceBelow = vh - (rect.top + rect.height);
    const placeBelow = spaceBelow >= cardH + 24 || spaceBelow > rect.top;
    const top = placeBelow ? rect.top + rect.height + 14 : rect.top - cardH - 14;
    const left = Math.max(16, Math.min(vw - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
    cardStyle = { left, top: Math.max(16, Math.min(vh - cardH - 16, top)) };
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 999990 }} aria-modal="true" role="dialog" aria-label="Tutorial de la app">
      <style>{`
        @keyframes rct-in { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes rct-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rct-ring { 0%,100% { box-shadow: 0 0 0 2px ${LIME}, 0 0 0 9999px rgba(9,9,11,.62); } 50% { box-shadow: 0 0 0 4px ${LIME}, 0 0 0 9999px rgba(9,9,11,.62); } }
        .rct-b { transition: transform .15s ease, filter .15s ease, background .15s ease; }
        .rct-b:hover { filter: brightness(1.08); }
        .rct-b:active { transform: scale(.97); }
        .rct-g:hover { background: rgba(255,255,255,.1) !important; color: #fff !important; }
      `}</style>

      {/* Fondo: con elemento, el "hueco" iluminado; sin elemento, solo oscuro */}
      {rect ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            borderRadius: 18, pointerEvents: "none",
            transition: "top .35s cubic-bezier(.16,1,.3,1), left .35s cubic-bezier(.16,1,.3,1), width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1)",
            animation: "rct-ring 2s ease-in-out infinite",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(9,9,11,.62)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "rct-fade .2s ease both" }} />
      )}
      {/* Capa que bloquea clics en la app mientras dura el tutorial */}
      <div style={{ position: "fixed", inset: 0 }} />

      <div
        ref={cardRef}
        key={i}
        style={{
          position: "fixed", ...cardStyle,
          width: mobile && rect ? undefined : cardW,
          padding: "18px 18px 14px",
          borderRadius: 22,
          background: "rgba(17,19,24,.97)",
          border: "1px solid rgba(255,255,255,.1)",
          boxShadow: "0 30px 70px -18px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06)",
          color: "#f4f4f5",
          animation: "rct-in .3s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: LIME, textTransform: "uppercase" }}>
            Paso {i + 1} de {total}
          </span>
          {!isLast ? (
            <button type="button" onClick={finish} className="rct-b rct-g"
              style={{ border: "none", background: "transparent", color: "#a1a1aa", fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 8, cursor: "pointer" }}>
              Saltar
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 13, display: "grid", placeItems: "center", fontSize: 20, background: "rgba(163,230,53,.12)", border: "1px solid rgba(163,230,53,.25)" }}>
            {step.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.25 }}>{step.title}</div>
            <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: "#d4d4d8" }}>{step.body}</p>
          </div>
        </div>

        {/* Puntos de progreso */}
        <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 12 }}>
          {STEPS.map((_, k) => (
            <span key={k} style={{ height: 4, flex: k === i ? 3 : 1, borderRadius: 99, background: k <= i ? LIME : "rgba(255,255,255,.12)", transition: "flex .3s ease, background .3s ease" }} />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {i > 0 ? (
            <button type="button" onClick={back} className="rct-b rct-g"
              style={{ height: 38, padding: "0 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#e4e4e7", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Atrás
            </button>
          ) : null}
          <button type="button" onClick={next} className="rct-b" autoFocus
            style={{ height: 38, padding: "0 18px", borderRadius: 12, border: "none", background: LIME, color: "#1a2e05", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {i === 0 ? "Empezar" : isLast ? "Terminar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
