"use client";

/**
 * Centro de tutoriales + motor interactivo.
 * - Centro: tarjetas por categoría con progreso (✓). Se abre con el evento "rc:openTutorials".
 * - Motor: ilumina cada parte (también dentro del reporte, que es un iframe), y según el paso
 *   espera a que el usuario toque, escriba o elija algo antes de seguir.
 * - Tutoriales de práctica: lo creado lleva la marca "__practice" y se borra al terminar
 *   (evento "rc:practiceCleanup"); nunca va al Excel ni a OneDrive.
 * - El tutorial activo se guarda en sessionStorage para seguir si la página se recarga.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight, Banknote, Check, Clock, Compass, Contact, FileDown, FilePlus2, FileSpreadsheet, Folder, FolderOpen,
  ListChecks, NotebookPen, Search, Smartphone, Trash2, X, type LucideIcon,
} from "lucide-react";
import { CATEGORIES, TUTORIALS, type Step, type Target, type Tutorial } from "./tutorialData";

const DONE_KEY = "rc:tut:done:v1";
const WELCOMED_KEY = "rc:tut:welcomed:v1";
const ACTIVE_KEY = "rc:tut:active:v1";
export const PRACTICE_KEY = "rc:practice";

const LIME = "#a3e635";
const PAD = 8;
const REPORT_IFRAME = 'iframe[title="Reporte Return Checks"]';

/* ───────── buscar elementos (también dentro del reporte) ───────── */

type Found = { el: Element; rect: DOMRect; frame: HTMLIFrameElement | null };

function frameDoc(): { doc: Document; frame: HTMLIFrameElement } | null {
  const f = document.querySelector<HTMLIFrameElement>(REPORT_IFRAME);
  try {
    const d = f?.contentDocument;
    if (f && d && d.readyState !== "loading") return { doc: d, frame: f };
  } catch {}
  return null;
}

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  if (r.width < 3 || r.height < 3) return false;
  const win = el.ownerDocument.defaultView ?? window;
  const cs = win.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function hasText(el: Element, t?: string) {
  return !t || norm((el as HTMLElement).innerText ?? el.textContent ?? "").includes(norm(t));
}

function findOne(t: Target): Found | null {
  let root: ParentNode = document;
  let frame: HTMLIFrameElement | null = null;
  if (t.frame) {
    const fd = frameDoc();
    if (!fd) return null;
    root = fd.doc;
    frame = fd.frame;
  }
  const containers: ParentNode[] = t.within
    ? Array.from(root.querySelectorAll(t.within.css)).filter((c) => hasText(c, t.within!.text) && visible(c))
    : [root];
  for (const c of containers) {
    let list: Element[] = [];
    try {
      list = Array.from(c.querySelectorAll(t.css));
    } catch {
      return null;
    }
    // El texto se busca en el elemento más chico que lo contiene (no en contenedores grandes).
    const matches = list.filter((el) => visible(el) && hasText(el, t.text));
    const el = t.text ? matches.sort((a, b) => (a as HTMLElement).innerText.length - (b as HTMLElement).innerText.length)[0] : matches[0];
    if (el) {
      const r = el.getBoundingClientRect();
      if (!frame) return { el, rect: r, frame };
      const fr = frame.getBoundingClientRect();
      return { el, frame, rect: new DOMRect(r.left + fr.left, r.top + fr.top, r.width, r.height) };
    }
  }
  return null;
}

function find(ts?: Target | Target[]): Found | null {
  if (!ts) return null;
  for (const t of Array.isArray(ts) ? ts : [ts]) {
    const f = findOne(t);
    if (f) return f;
  }
  return null;
}

function fieldValue(el: Element): string {
  const field = el.matches("input,select,textarea") ? el : el.querySelector("input:not([type=hidden]),select,textarea");
  return String((field as HTMLInputElement | null)?.value ?? "").trim();
}

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

/* ───────── componente ───────── */

type Active = { id: string; i: number };

export default function Tutorials() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Active | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [lost, setLost] = useState(false); // no se encuentra la parte después de un rato
  const [filled, setFilled] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [vw, setVw] = useState(1200);
  const [vh, setVh] = useState(800);
  const [cardH, setCardH] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef(1);
  const elRef = useRef<Element | null>(null);
  const clickedRef = useRef(false);

  const tut: Tutorial | null = useMemo(() => (active ? TUTORIALS.find((t) => t.id === active.id) ?? null : null), [active]);
  const step: Step | null = tut && active ? tut.steps[active.i] ?? null : null;

  useEffect(() => {
    setMounted(true);
    setDone(readDone());
    try {
      const a = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null") as Active | null;
      if (a && TUTORIALS.some((t) => t.id === a.id)) setActive(a);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (active) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      else sessionStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, [active]);

  // Abrir el centro: botón ? / menú, y la primera vez en cada equipo.
  useEffect(() => {
    const open = () => setCenterOpen(true);
    window.addEventListener("rc:openTutorials", open);
    window.addEventListener("rc:startTour", open);
    return () => {
      window.removeEventListener("rc:openTutorials", open);
      window.removeEventListener("rc:startTour", open);
    };
  }, []);
  useEffect(() => {
    if (pathname !== "/app") return;
    let welcomed = true;
    try { welcomed = !!localStorage.getItem(WELCOMED_KEY); } catch {}
    if (welcomed) return;
    const t = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]') || sessionStorage.getItem(ACTIVE_KEY)) return;
      try { localStorage.setItem(WELCOMED_KEY, "1"); } catch {}
      setCenterOpen(true);
    }, 1800);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const endPractice = useCallback(() => {
    try { sessionStorage.removeItem(PRACTICE_KEY); } catch {}
    try { window.dispatchEvent(new CustomEvent("rc:practiceCleanup")); } catch {}
  }, []);

  const stop = useCallback(
    (completed: boolean) => {
      if (tut?.practice) endPractice();
      if (completed && tut) {
        const s = readDone();
        s.add(tut.id);
        try { localStorage.setItem(DONE_KEY, JSON.stringify([...s])); } catch {}
        setDone(s);
      }
      setActive(null);
      setRect(null);
      if (completed) window.setTimeout(() => setCenterOpen(true), 400);
    },
    [tut, endPractice],
  );

  const start = useCallback(
    (t: Tutorial) => {
      setCenterOpen(false);
      dirRef.current = 1;
      try {
        if (t.practice) sessionStorage.setItem(PRACTICE_KEY, "1");
        else sessionStorage.removeItem(PRACTICE_KEY);
      } catch {}
      // Siempre se empieza desde la pantalla principal
      try { window.dispatchEvent(new CustomEvent("rc:goToDashboard")); } catch {}
      if (pathname !== "/app") router.push("/app");
      window.scrollTo({ top: 0 });
      window.setTimeout(() => setActive({ id: t.id, i: 0 }), 350);
    },
    [pathname, router],
  );

  const go = useCallback(
    (delta: number) => {
      if (!tut || !active) return;
      dirRef.current = delta;
      const n = active.i + delta;
      if (n >= tut.steps.length) return stop(true);
      if (n < 0) return;
      setActive({ id: tut.id, i: n });
    },
    [tut, active, stop],
  );

  // Reiniciar estado de cada paso
  useEffect(() => {
    setFilled(false);
    setClicked(false);
    setMissing(false);
    setLost(false);
    elRef.current = null;
  }, [active?.id, active?.i]);

  // Bucle del paso: ubica la parte, revisa lo escrito y las condiciones para avanzar.
  useEffect(() => {
    if (!step || !active) return;
    let alive = true;
    const t0 = Date.now();
    let scrolled = false;
    let doneOnce = false;

    const advance = () => {
      if (doneOnce || !alive) return;
      doneOnce = true;
      window.setTimeout(() => alive && go(1), 250);
    };

    const tick = () => {
      if (!alive) return;
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      const f = step.target ? find(step.target) : null;
      elRef.current = f?.el ?? null;

      if (step.target && !f) {
        const waited = Date.now() - t0;
        if (step.optional && waited > 2500) {
          // saltar en la misma dirección
          const n = active.i + (dirRef.current < 0 ? -1 : 1);
          const tLen = tut?.steps.length ?? 0;
          alive = false;
          if (n >= tLen) stop(true);
          else if (n < 0) go(1);
          else setActive({ id: active.id, i: n });
          return;
        }
        setMissing(true);
        setLost(waited > 9000);
        setRect(null);
      } else {
        setMissing(false);
        setLost(false);
        if (f) {
          if (!scrolled) {
            scrolled = true;
            const r = f.el.getBoundingClientRect();
            const winH = f.frame ? f.frame.clientHeight : window.innerHeight;
            const fixed = !f.frame && !!(f.el as HTMLElement).closest('.kn-dock, header, [role="dialog"], .fixed');
            if (!fixed && (r.top < 70 || r.bottom > winH - 70)) {
              try { (f.el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
            }
          }
          let l = f.rect.left, t = f.rect.top, rr = f.rect.right, bb = f.rect.bottom;
          // Si hay un calendario o una lista desplegable abierta, también se ilumina para poder tocarla.
          if ((step.do === "type" || step.do === "choose") && f.frame) {
            const d = f.frame.contentDocument;
            const fr = f.frame.getBoundingClientRect();
            const pops = [d?.getElementById("cp-days")?.parentElement, ...Array.from(d?.querySelectorAll(".customDropList") ?? [])];
            for (const cal of pops) {
              if (!cal || !visible(cal)) continue;
              const c = cal.getBoundingClientRect();
              l = Math.min(l, c.left + fr.left); t = Math.min(t, c.top + fr.top);
              rr = Math.max(rr, c.right + fr.left); bb = Math.min(Math.max(bb, c.bottom + fr.top), window.innerHeight - 8);
            }
          }
          setRect(new DOMRect(l - PAD, t - PAD, rr - l + PAD * 2, bb - t + PAD * 2));
        } else setRect(null);
      }

      // Escribir / elegir
      if ((step.do === "type" || step.do === "choose") && f) {
        const v = fieldValue(f.el);
        const ok = v.length >= (step.minLen ?? 1) && !/^(select|rellenar)$/i.test(v);
        setFilled(ok);
      }
      // Esperar a que aparezca / desaparezca algo
      if (step.do === "wait" || clickedRef.current) {
        if (step.until && find(step.until)) return advance();
        if (step.untilGone && !find(step.untilGone)) return advance();
        if (step.do === "click" && !step.until && !step.untilGone) return advance();
      }
    };

    tick();
    const iv = window.setInterval(tick, 80);
    // El scroll dentro del reporte (iframe) no llega a la ventana: se escucha aparte.
    let fw: Window | null = null;
    try { fw = frameDoc()?.frame.contentWindow ?? null; fw?.addEventListener("scroll", tick, { passive: true, capture: true }); } catch {}
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, { passive: true, capture: true });
    return () => {
      alive = false;
      window.clearInterval(iv);
      try { fw?.removeEventListener("scroll", tick, { capture: true } as EventListenerOptions); } catch {}
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, { capture: true } as EventListenerOptions);
    };
  }, [step, active, tut, go, stop]);

  // Detectar el clic del usuario en la parte iluminada (también dentro del reporte).
  useEffect(() => {
    clickedRef.current = false;
  }, [active?.id, active?.i]);
  useEffect(() => {
    if (!step || step.do !== "click") return;
    const onClick = (e: Event) => {
      const el = elRef.current;
      if (el && e.target instanceof Node && (el === e.target || el.contains(e.target))) {
        clickedRef.current = true;
        setClicked(true);
      }
    };
    document.addEventListener("click", onClick, true);
    let fdoc: Document | null = null;
    const attach = window.setInterval(() => {
      const fd = frameDoc();
      if (fd && fd.doc !== fdoc) {
        fdoc?.removeEventListener("click", onClick, true);
        fdoc = fd.doc;
        fdoc.addEventListener("click", onClick, true);
      }
    }, 400);
    return () => {
      document.removeEventListener("click", onClick, true);
      fdoc?.removeEventListener("click", onClick, true);
      window.clearInterval(attach);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  // Teclado (sin estorbar cuando se escribe en un campo)
  useEffect(() => {
    if (!active && !centerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Escape") {
        if (active) stop(false);
        else setCenterOpen(false);
        return;
      }
      if (!active || typing || !step) return;
      const canNext = !step.do || ((step.do === "type" || step.do === "choose") && filled);
      if ((e.key === "ArrowRight" || e.key === "Enter") && canNext) { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, centerOpen, step, filled, go, stop]);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{CSS}</style>
      {centerOpen && !active ? <Center done={done} onClose={() => setCenterOpen(false)} onStart={start} /> : null}
      {active && tut && step ? (
        <Runner
          tut={tut}
          i={active.i}
          step={step}
          rect={rect}
          missing={missing}
          lost={lost}
          filled={filled}
          clicked={clicked}
          vw={vw}
          vh={vh}
          cardH={cardH}
          cardRef={cardRef}
          onNext={() => go(1)}
          onBack={() => go(-1)}
          onExit={() => stop(false)}
        />
      ) : null}
    </>,
    document.body,
  );
}

/* ───────── Centro de tutoriales ───────── */

const TUT_ICON: Record<string, LucideIcon> = {
  tour: Compass,
  search: Search,
  create: FilePlus2,
  open: FolderOpen,
  payment: Banknote,
  notes: NotebookPen,
  contacts: Contact,
  export: FileDown,
  registro: FileSpreadsheet,
  docs: Folder,
  trash: Trash2,
  select: ListChecks,
  phone: Smartphone,
};
const CAT_TONE: Record<string, string> = { start: "ink", reports: "red", follow: "amber", files: "green", more: "violet" };

function Center({ done, onClose, onStart }: { done: Set<string>; onClose: () => void; onStart: (t: Tutorial) => void }) {
  const [cat, setCat] = useState<string>("all");
  const total = TUTORIALS.length;
  const n = TUTORIALS.filter((t) => done.has(t.id)).length;
  const next = TUTORIALS.find((t) => !done.has(t.id));
  const pct = n / total;
  const R = 34;
  const C = 2 * Math.PI * R;
  const cats = CATEGORIES.filter((c) => TUTORIALS.some((t) => t.category === c.id));
  const shown = cats.filter((c) => cat === "all" || c.id === cat);

  return (
    <div className="rtc-back" onClick={onClose} role="dialog" aria-label="Centro de tutoriales">
      <div className="rtc" onClick={(e) => e.stopPropagation()}>
        <div className="rtc-scroll">
          {/* Bloque negro, como "Mis expedientes" */}
          <header className="rtc-hero">
            <button type="button" className="rtc-x" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
            <div className="rtc-hero-txt">
              <div className="rtc-eyebrow">Return Checks · Tutoriales</div>
              <h2>Aprende<br />la app</h2>
              <p>Tutoriales cortos donde <b>tú haces cada paso</b>. Los de práctica crean un reporte de prueba que se borra solo.</p>
              <div className="rtc-chips">
                <span>{total} tutoriales</span>
                <span>{n} completados</span>
              </div>
            </div>
            <div className="rtc-hero-side">
              <div className="rtc-ring">
                <svg viewBox="0 0 80 80" aria-hidden>
                  <circle cx="40" cy="40" r={R} className="bg" />
                  <circle cx="40" cy="40" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
                </svg>
                <div><b>{n}</b><small>de {total}</small></div>
              </div>
              {next ? (
                <button type="button" className="rtc-cta" onClick={() => onStart(next)}>
                  <span>{n ? "Seguir con" : "Empezar con"}</span>
                  <b>{next.title}</b>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              ) : (
                <div className="rtc-alldone"><Check className="h-4 w-4" /> ¡Terminaste todos!</div>
              )}
            </div>
          </header>

          {/* Barra de categorías, como la barra de abajo de la app */}
          <nav className="rtc-tabs" aria-label="Categorías">
            {[{ id: "all", title: "Todos" }, ...cats].map((c) => (
              <button key={c.id} type="button" className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
                {c.title}
              </button>
            ))}
          </nav>

          {shown.map((c) => {
            const list = TUTORIALS.filter((t) => t.category === c.id);
            const tone = CAT_TONE[c.id] ?? "ink";
            return (
              <section key={c.id} className="rtc-sec">
                <div className="rtc-cat">
                  <h3>{c.title}</h3>
                  <span>{c.desc}</span>
                </div>
                <div className="rtc-grid">
                  {list.map((t) => {
                    const ok = done.has(t.id);
                    const Ico = TUT_ICON[t.id] ?? Compass;
                    return (
                      <button key={t.id} type="button" className={`rtc-card ${ok ? "ok" : ""}`} onClick={() => onStart(t)}>
                        <div className="rtc-card-top">
                          <span className={`rtc-ico t-${tone}`}><Ico className="h-5 w-5" strokeWidth={2.2} /></span>
                          {ok ? (
                            <span className="rtc-done"><Check className="h-3.5 w-3.5" strokeWidth={3} /> Hecho</span>
                          ) : t.practice ? (
                            <span className="rtc-prac">Práctica</span>
                          ) : null}
                        </div>
                        <b className="rtc-title">{t.title}</b>
                        <small className="rtc-desc">{t.desc}</small>
                        <div className="rtc-card-foot">
                          <span className="rtc-min"><Clock className="h-3.5 w-3.5" /> {t.minutes} min</span>
                          <span className="rtc-go">{ok ? "Repetir" : "Empezar"} <ArrowRight className="h-3.5 w-3.5" /></span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <p className="rtc-foot">Vuelve aquí cuando quieras con el botón <b>?</b> de arriba.</p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Tarjeta del paso + oscurecido ───────── */

function Runner(p: {
  tut: Tutorial;
  i: number;
  step: Step;
  rect: DOMRect | null;
  missing: boolean;
  lost: boolean;
  filled: boolean;
  clicked: boolean;
  vw: number;
  vh: number;
  cardH: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}) {
  const { tut, i, step, rect, vw, vh, cardH } = p;
  const total = tut.steps.length;
  const isLast = i === total - 1;
  const interactive = step.do === "click" || step.do === "type" || step.do === "choose";
  const mobile = vw < 640;
  const cardW = Math.min(370, vw - 24);

  // Oscurecido: con parte iluminada, 4 paneles alrededor (así se puede tocar la parte); sin parte, todo.
  const shade = "rgba(9,9,11,.6)";
  const panes = rect
    ? [
        { left: 0, top: 0, width: vw, height: Math.max(0, rect.top) },
        { left: 0, top: rect.bottom, width: vw, height: Math.max(0, vh - rect.bottom) },
        { left: 0, top: rect.top, width: Math.max(0, rect.left), height: rect.height },
        { left: rect.right, top: rect.top, width: Math.max(0, vw - rect.right), height: rect.height },
      ]
    : null;

  let pos: React.CSSProperties;
  if (!rect) pos = { left: Math.max(12, (vw - cardW) / 2), top: Math.max(12, (vh - cardH) / 2) };
  else if (mobile) {
    const targetLow = rect.top + rect.height / 2 > vh / 2;
    pos = targetLow ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))" };
  } else {
    const below = vh - rect.bottom;
    const above = rect.top;
    const right = vw - rect.right;
    let top: number;
    let left: number;
    if (below >= cardH + 20) { top = rect.bottom + 14; left = rect.left + rect.width / 2 - cardW / 2; }
    else if (above >= cardH + 20) { top = rect.top - cardH - 14; left = rect.left + rect.width / 2 - cardW / 2; }
    else if (right >= cardW + 20) { left = rect.right + 14; top = rect.top + rect.height / 2 - cardH / 2; }
    else { left = rect.left - cardW - 14; top = rect.top + rect.height / 2 - cardH / 2; }
    pos = { left: Math.max(12, Math.min(vw - cardW - 12, left)), top: Math.max(12, Math.min(vh - cardH - 12, top)) };
  }

  const canNext = !step.do || ((step.do === "type" || step.do === "choose") && p.filled);

  return (
    <div className="rtr" role="dialog" aria-label={`Tutorial: ${tut.title}`}>
      {panes ? (
        <>
          {panes.map((s, k) => (
            <div key={k} className="rtr-pane" style={{ ...s, background: shade }} />
          ))}
          <div
            className={`rtr-ring ${interactive ? "go" : ""}`}
            style={{ left: rect!.left, top: rect!.top, width: rect!.width, height: rect!.height }}
          />
          {/* Pasos que solo explican: la parte iluminada no se puede tocar */}
          {!interactive ? <div className="rtr-pane" style={{ left: rect!.left, top: rect!.top, width: rect!.width, height: rect!.height }} /> : null}
        </>
      ) : (
        <div className="rtr-pane" style={{ inset: 0, background: shade, backdropFilter: "blur(2px)" }} />
      )}

      <div ref={p.cardRef} key={`${tut.id}-${i}`} className="rtr-card" style={{ ...pos, width: mobile && rect ? undefined : cardW }}>
        <div className="rtr-top">
          <span className="rtr-crumb">{tut.icon} {tut.title} · {i + 1}/{total}</span>
          <button type="button" className="rtr-ghost" onClick={p.onExit}>Salir</button>
        </div>
        <div className="rtr-main">
          {step.icon ? <div className="rtr-ico">{step.icon}</div> : null}
          <div style={{ minWidth: 0 }}>
            <div className="rtr-title">{step.title}</div>
            {step.body ? <p className="rtr-body">{step.body}</p> : null}
          </div>
        </div>

        {p.missing ? (
          <div className="rtr-wait">
            <span className="rtr-spin" />
            {p.lost ? "No encuentro esta parte en tu pantalla. Puedes saltar este paso." : "Esperando…"}
          </div>
        ) : step.hint ? (
          <div className={`rtr-hint ${p.filled || p.clicked ? "ok" : ""}`}>
            {p.filled || p.clicked ? "✓ ¡Muy bien!" : `👉 ${step.hint}`}
          </div>
        ) : null}

        <div className="rtr-dots">
          {tut.steps.map((_, k) => (
            <i key={k} style={{ flex: k === i ? 3 : 1, background: k <= i ? LIME : "rgba(255,255,255,.13)" }} />
          ))}
        </div>

        <div className="rtr-actions">
          {i > 0 ? <button type="button" className="rtr-btn ghost" onClick={p.onBack}>Atrás</button> : null}
          {p.lost || (interactive && !canNext && !p.missing) ? (
            <button type="button" className="rtr-btn ghost" onClick={p.onNext} title="Seguir sin hacer este paso">
              Omitir
            </button>
          ) : null}
          {step.do === "wait" || step.do === "click" ? null : (
            <button type="button" className="rtr-btn" onClick={p.onNext} disabled={!canNext} autoFocus={!interactive}>
              {i === 0 && !step.do ? "Empezar" : isLast ? "Terminar" : "Siguiente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@keyframes rt-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes rt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rt-ring { 0%,100% { box-shadow: 0 0 0 2px ${LIME}, 0 0 24px rgba(163,230,53,.35); } 50% { box-shadow: 0 0 0 4px ${LIME}, 0 0 34px rgba(163,230,53,.55); } }
@keyframes rt-spin { to { transform: rotate(360deg); } }
.rtr { position: fixed; inset: 0; z-index: 999990; pointer-events: none; font-family: inherit; }
.rtr-pane { position: fixed; pointer-events: auto; transition: all .3s cubic-bezier(.16,1,.3,1); }
.rtr-ring { position: fixed; border-radius: 14px; pointer-events: none; animation: rt-ring 2s ease-in-out infinite;
  transition: left .3s cubic-bezier(.16,1,.3,1), top .3s cubic-bezier(.16,1,.3,1), width .3s cubic-bezier(.16,1,.3,1), height .3s cubic-bezier(.16,1,.3,1); }
.rtr-ring.go::after { content: ""; position: absolute; inset: -6px; border-radius: 18px; border: 2px dashed rgba(163,230,53,.7); }
.rtr-card { position: fixed; pointer-events: auto; padding: 16px 16px 14px; border-radius: 22px; color: #f4f4f5;
  background: rgba(17,19,24,.97); border: 1px solid rgba(255,255,255,.1);
  box-shadow: 0 30px 70px -18px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.06);
  animation: rt-in .32s cubic-bezier(.16,1,.3,1) both; }
.rtr-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.rtr-crumb { font-size: 11px; font-weight: 800; letter-spacing: .03em; color: ${LIME}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rtr-ghost { border: none; background: transparent; color: #a1a1aa; font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 8px; cursor: pointer; }
.rtr-ghost:hover { background: rgba(255,255,255,.1); color: #fff; }
.rtr-main { display: flex; gap: 12px; align-items: flex-start; }
.rtr-ico { width: 40px; height: 40px; flex-shrink: 0; border-radius: 13px; display: grid; place-items: center; font-size: 20px;
  background: rgba(163,230,53,.12); border: 1px solid rgba(163,230,53,.25); }
.rtr-title { font-size: 16px; font-weight: 800; letter-spacing: -.01em; line-height: 1.25; }
.rtr-body { margin: 6px 0 0; font-size: 13px; line-height: 1.55; color: #d4d4d8; }
.rtr-hint { margin-top: 12px; padding: 9px 12px; border-radius: 12px; font-size: 13px; font-weight: 800; color: ${LIME};
  background: rgba(163,230,53,.1); border: 1px solid rgba(163,230,53,.28); }
.rtr-hint.ok { color: #1a2e05; background: ${LIME}; }
.rtr-wait { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa; }
.rtr-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(163,230,53,.2); border-top-color: ${LIME}; animation: rt-spin .8s linear infinite; }
.rtr-dots { display: flex; gap: 3px; margin: 14px 0 12px; }
.rtr-dots i { height: 4px; border-radius: 99px; transition: flex .3s ease, background .3s ease; }
.rtr-actions { display: flex; justify-content: flex-end; gap: 8px; }
.rtr-btn { height: 38px; padding: 0 18px; border-radius: 12px; border: none; background: ${LIME}; color: #1a2e05; font-size: 13px; font-weight: 800; cursor: pointer;
  transition: transform .15s ease, filter .15s ease, opacity .15s ease; }
.rtr-btn:hover { filter: brightness(1.07); }
.rtr-btn:active { transform: scale(.97); }
.rtr-btn:disabled { opacity: .35; cursor: default; }
.rtr-btn.ghost { background: transparent; color: #e4e4e7; border: 1px solid rgba(255,255,255,.14); padding: 0 14px; }
.rtr-btn.ghost:hover { background: rgba(255,255,255,.08); }

.rtc-back { position: fixed; inset: 0; z-index: 999980; display: grid; place-items: center; padding: 12px;
  background: rgba(9,9,11,.45); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: rt-fade .2s ease both; }
.rtc { --s-bg: #f4f4f5; --s-card: #fff; --s-ink: #18181b; --s-mute: #71717a; --s-line: rgba(24,24,27,.07); --s-chip: #f4f4f5;
  position: relative; width: min(980px, 100%); max-height: min(92dvh, 940px); display: flex; flex-direction: column; overflow: hidden;
  border-radius: 32px; background: var(--s-bg); color: var(--s-ink);
  font-family: var(--font-geist-sans), -apple-system, "SF Pro Display", system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  box-shadow: 0 50px 120px -30px rgba(0,0,0,.55); animation: rt-in .38s cubic-bezier(.16,1,.3,1) both; }
html.dark .rtc { --s-bg: #0c0c0e; --s-card: #18181b; --s-ink: #f4f4f5; --s-mute: #a1a1aa; --s-line: rgba(255,255,255,.08); --s-chip: #27272a; }
.rtc-scroll { overflow-y: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 18px; }
.rtc-x { position: absolute; top: 16px; right: 16px; z-index: 4; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 999px; border: 0; cursor: pointer;
  background: rgba(255,255,255,.12); color: #fff; transition: background .15s ease, transform .15s ease; }
.rtc-x:hover { background: rgba(255,255,255,.22); transform: rotate(90deg); }

.rtc-hero { position: relative; overflow: hidden; display: flex; gap: 20px; align-items: stretch; justify-content: space-between;
  padding: 26px 26px 24px; border-radius: 26px; background: #18181b; color: #fff; flex-shrink: 0; }
.rtc-hero::after { content: ""; position: absolute; right: -60px; top: -80px; width: 320px; height: 320px; border-radius: 50%;
  background: radial-gradient(circle, rgba(163,230,53,.22), transparent 65%); pointer-events: none; }
.rtc-hero-txt { position: relative; z-index: 1; min-width: 0; }
.rtc-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.5); }
.rtc-hero h2 { margin: 14px 0 10px; font-size: clamp(38px, 6.4vw, 64px); line-height: .92; font-weight: 900; letter-spacing: -.055em; }
.rtc-hero p { margin: 0; max-width: 430px; font-size: 13.5px; line-height: 1.5; color: rgba(255,255,255,.62); }
.rtc-hero p b { color: #fff; }
.rtc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 16px; }
.rtc-chips span { padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,.1); font-size: 12px; font-weight: 800; }
.rtc-hero-side { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; gap: 14px; padding-top: 40px; flex-shrink: 0; }
.rtc-ring { position: relative; width: 92px; height: 92px; }
.rtc-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.rtc-ring circle { fill: none; stroke-width: 8; }
.rtc-ring .bg { stroke: rgba(255,255,255,.1); }
.rtc-ring .fg { stroke: #a3e635; stroke-linecap: round; transition: stroke-dashoffset .8s cubic-bezier(.16,1,.3,1); }
.rtc-ring div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
.rtc-ring b { font-size: 26px; font-weight: 900; letter-spacing: -.04em; line-height: 1; }
.rtc-ring small { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.5); }
.rtc-cta { display: flex; align-items: center; gap: 8px; max-width: 290px; height: 46px; padding: 0 16px 0 18px; border: 0; border-radius: 999px; cursor: pointer;
  background: #a3e635; color: #1a2e05; font: inherit; font-size: 13px; box-shadow: 0 10px 30px -8px rgba(163,230,53,.55); transition: transform .15s ease, filter .15s ease; }
.rtc-cta span { font-weight: 600; opacity: .75; white-space: nowrap; }
.rtc-cta b { font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rtc-cta:hover { filter: brightness(1.05); transform: translateY(-1px); }
.rtc-alldone { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-radius: 999px; background: rgba(163,230,53,.15); color: #a3e635; font-size: 13px; font-weight: 800; }

.rtc-tabs { display: flex; gap: 4px; padding: 5px; border-radius: 999px; background: #18181b; overflow-x: auto; scrollbar-width: none; position: sticky; top: 0; z-index: 3; flex-shrink: 0;
  box-shadow: 0 -14px 0 6px var(--s-bg), 0 12px 30px -14px rgba(0,0,0,.45); }
html.dark .rtc-tabs { background: #27272a; }
.rtc-tabs::-webkit-scrollbar { display: none; }
.rtc-tabs button { flex-shrink: 0; height: 36px; padding: 0 16px; border: 0; border-radius: 999px; cursor: pointer; background: transparent;
  color: rgba(255,255,255,.6); font: inherit; font-size: 13px; font-weight: 800; transition: background .15s ease, color .15s ease; }
.rtc-tabs button:hover { color: #fff; }
.rtc-tabs button.on { background: #fff; color: #18181b; }

.rtc-sec { display: flex; flex-direction: column; gap: 10px; }
.rtc-cat { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0 4px; }
.rtc-cat h3 { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -.035em; }
.rtc-cat span { font-size: 12.5px; color: var(--s-mute); font-weight: 600; }
.rtc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.rtc-card { display: flex; flex-direction: column; align-items: stretch; gap: 6px; text-align: left; padding: 16px; border-radius: 24px; cursor: pointer;
  border: 1px solid var(--s-line); background: var(--s-card); color: inherit; font: inherit;
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 10px 30px -18px rgba(0,0,0,.25); transition: transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s ease; }
.rtc-card:hover { transform: translateY(-3px); box-shadow: 0 2px 4px rgba(0,0,0,.05), 0 22px 40px -20px rgba(0,0,0,.35); }
.rtc-card:hover .rtc-go { background: #a3e635; color: #1a2e05; }
.rtc-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
.rtc-ico { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 15px; }
.rtc-ico.t-ink { background: #18181b; color: #a3e635; }
.rtc-ico.t-red { background: #fee2e2; color: #dc2626; }
.rtc-ico.t-amber { background: #fef3c7; color: #b45309; }
.rtc-ico.t-green { background: #dcfce7; color: #15803d; }
.rtc-ico.t-violet { background: #ede9fe; color: #7c3aed; }
html.dark .rtc-ico.t-ink { background: #27272a; }
html.dark .rtc-ico.t-red { background: rgba(220,38,38,.18); color: #fca5a5; }
html.dark .rtc-ico.t-amber { background: rgba(217,119,6,.18); color: #fcd34d; }
html.dark .rtc-ico.t-green { background: rgba(22,163,74,.18); color: #86efac; }
html.dark .rtc-ico.t-violet { background: rgba(124,58,237,.2); color: #c4b5fd; }
.rtc-done, .rtc-prac { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }
.rtc-done { background: #a3e635; color: #1a2e05; }
.rtc-prac { background: #e0f2fe; color: #0369a1; }
html.dark .rtc-prac { background: rgba(14,165,233,.16); color: #7dd3fc; }
.rtc-title { font-size: 16px; font-weight: 900; letter-spacing: -.025em; line-height: 1.2; }
.rtc-desc { font-size: 12.5px; line-height: 1.45; color: var(--s-mute); flex: 1; }
.rtc-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 12px; border-top: 1px dashed var(--s-line); }
.rtc-min { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--s-mute); }
.rtc-go { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border-radius: 999px; background: var(--s-ink); color: var(--s-card);
  font-size: 12px; font-weight: 800; transition: background .15s ease, color .15s ease; }
.rtc-card.ok .rtc-go { background: var(--s-chip); color: var(--s-ink); }
.rtc-foot { margin: 4px 0 10px; text-align: center; font-size: 12px; color: var(--s-mute); }
.rtc-foot b { color: var(--s-ink); }
@media (max-width: 860px) { .rtc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) {
  .rtc { border-radius: 26px; }
  .rtc-scroll { padding: 10px 10px 4px; }
  .rtc-hero { flex-direction: column; padding: 22px 20px 20px; }
  .rtc-hero-side { flex-direction: row; align-items: center; justify-content: space-between; padding-top: 0; }
  .rtc-ring { width: 72px; height: 72px; }
  .rtc-cta { max-width: 220px; }
  .rtc-x { top: 12px; right: 12px; }
  .rtc-grid { grid-template-columns: 1fr; }
}
`;
