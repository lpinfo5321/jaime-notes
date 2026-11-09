import type { ExportedFile } from "./nsfExport";

type Btn = { id: string; label: string; tone?: "primary" | "ghost" | "plain" };

const CSS = `
.rcx-bg{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:16px;background:rgba(9,9,11,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:rcx-fade .18s ease both;font-family:var(--font-geist-sans),system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.rcx{--b:#fff;--i:#18181b;--m:#71717a;--l:rgba(24,24,27,.08);--c:#f4f4f5;width:min(100%,440px);border-radius:28px;background:var(--b);color:var(--i);box-shadow:0 40px 100px -25px rgba(0,0,0,.55);overflow:hidden;animation:rcx-pop .32s cubic-bezier(.16,1,.3,1) both}
html.dark .rcx{--b:#18181b;--i:#f4f4f5;--m:#a1a1aa;--l:rgba(255,255,255,.08);--c:#27272a}
.rcx-top{display:flex;gap:14px;align-items:flex-start;padding:22px 22px 6px}
.rcx-ico{flex-shrink:0;width:46px;height:46px;border-radius:16px;display:grid;place-items:center;background:#18181b;color:#a3e635}
html.dark .rcx-ico{background:#27272a}
.rcx-t{margin:2px 0 0;font-size:18px;font-weight:900;letter-spacing:-.025em;line-height:1.2}
.rcx-d{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--m)}
.rcx-files{margin:12px 22px 0;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}
.rcx-f{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;background:var(--c)}
.rcx-f svg{flex-shrink:0;color:#dc2626}
.rcx-f b{display:block;font-size:12.5px;font-weight:800;word-break:break-word}
.rcx-f small{display:block;margin-top:2px;font-size:11.5px;color:var(--m)}
.rcx-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;padding:18px 22px 22px}
.rcx-b{height:40px;padding:0 16px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:13px;font-weight:800;transition:filter .15s ease,transform .15s ease,background .15s ease}
.rcx-b:hover{transform:translateY(-1px)}
.rcx-b.primary{background:#18181b;color:#fff}
.rcx-b.primary:hover{background:#a3e635;color:#1a2e05}
html.dark .rcx-b.primary{background:#a3e635;color:#1a2e05}
.rcx-b.ghost{background:var(--c);color:var(--i)}
.rcx-b.plain{background:transparent;color:var(--m)}
.rcx-b.plain:hover{color:var(--i)}
.rcx-out{animation:rcx-fadeout .2s ease both}
@keyframes rcx-fade{from{opacity:0}to{opacity:1}}
@keyframes rcx-fadeout{to{opacity:0}}
@keyframes rcx-pop{from{opacity:0;transform:scale(.94) translateY(10px)}to{opacity:1;transform:none}}
@media (max-width:480px){.rcx-acts{flex-direction:column-reverse}.rcx-b{width:100%}}
`;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function when(f: ExportedFile) {
  if (!f.mtime) return `Carpeta ${f.year}`;
  const d = new Date(f.mtime);
  const date = d.toLocaleDateString("es-US", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit" });
  return `Exportado el ${date}, ${time} · carpeta ${f.year}`;
}

const FILE_ICO =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const COPY_ICO =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** Ventana para elegir qué hacer (ej. "ya se exportó"). Devuelve el id del botón, o "cancel". */
export function askExportChoice(opts: { title: string; detail: string; files?: ExportedFile[]; buttons: Btn[] }): Promise<string> {
  return new Promise((resolve) => {
    if (!document.getElementById("rcx-css")) {
      const st = document.createElement("style");
      st.id = "rcx-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const bg = document.createElement("div");
    bg.className = "rcx-bg";
    bg.setAttribute("role", "alertdialog");
    const files = (opts.files ?? []).slice(0, 8);
    bg.innerHTML = `
      <div class="rcx">
        <div class="rcx-top">
          <span class="rcx-ico">${COPY_ICO}</span>
          <div><p class="rcx-t">${esc(opts.title)}</p><p class="rcx-d">${esc(opts.detail)}</p></div>
        </div>
        ${files.length ? `<div class="rcx-files">${files.map((f) => `<div class="rcx-f">${FILE_ICO}<div><b>${esc(f.name)}</b><small>${esc(when(f))}</small></div></div>`).join("")}</div>` : ""}
        <div class="rcx-acts">${opts.buttons.map((b) => `<button type="button" class="rcx-b ${b.tone ?? "ghost"}" data-id="${esc(b.id)}">${esc(b.label)}</button>`).join("")}</div>
      </div>`;
    const done = (id: string) => {
      document.removeEventListener("keydown", onKey, true);
      bg.classList.add("rcx-out");
      window.setTimeout(() => bg.remove(), 200);
      resolve(id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done("cancel");
      }
    };
    bg.addEventListener("click", (e) => {
      if (e.target === bg) return done("cancel");
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id;
      if (id) done(id);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(bg);
    bg.querySelector<HTMLButtonElement>(".rcx-b.primary")?.focus();
  });
}
