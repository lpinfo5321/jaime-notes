/* Ventana animada de exportación: exportando / listo / error (el error nunca se cierra solo). */
(function () {
  if (window.rcNotice) return;
  var css =
    ".rcn-bg{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,23,42,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:rcn-fade .2s ease both;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".rcn-card{width:min(92vw,380px);padding:28px 26px 22px;border-radius:26px;background:#fff;color:#0f172a;text-align:center;box-shadow:0 30px 80px -20px rgba(0,0,0,.45);animation:rcn-pop .38s cubic-bezier(.2,.9,.3,1.25) both}" +
    "@media (prefers-color-scheme:dark){.rcn-card{background:#18181b;color:#f4f4f5}}" +
    ".rcn-ico{width:68px;height:68px;margin:0 auto 14px;display:grid;place-items:center;border-radius:99px;position:relative}" +
    ".rcn-spin{border:5px solid rgba(10,132,255,.18);border-top-color:#0a84ff;animation:rcn-rot .8s linear infinite}" +
    ".rcn-ok{background:#22c55e;animation:rcn-pop .4s cubic-bezier(.2,.9,.3,1.4) both}" +
    ".rcn-err{background:#ef4444;animation:rcn-shake .5s ease both}" +
    ".rcn-ico svg{width:34px;height:34px;stroke:#fff;fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}" +
    ".rcn-ok path{stroke-dasharray:30;stroke-dashoffset:30;animation:rcn-draw .45s .15s ease forwards}" +
    ".rcn-t{font-size:18px;font-weight:800;letter-spacing:-.01em}" +
    ".rcn-d{margin-top:6px;font-size:13px;line-height:1.45;opacity:.7;word-break:break-word;white-space:pre-line}" +
    ".rcn-bar{height:4px;margin:18px 6px 0;border-radius:9px;background:rgba(10,132,255,.15);overflow:hidden}" +
    ".rcn-bar i{display:block;height:100%;width:40%;border-radius:9px;background:#0a84ff;animation:rcn-slide 1.1s ease-in-out infinite}" +
    ".rcn-btn{margin-top:18px;border:0;border-radius:14px;padding:11px 26px;font-size:14px;font-weight:800;color:#fff;background:#ef4444;cursor:pointer}" +
    ".rcn-btn:hover{filter:brightness(1.08)}" +
    ".rcn-out{animation:rcn-fadeout .25s ease both}" +
    "@keyframes rcn-fade{from{opacity:0}to{opacity:1}}" +
    "@keyframes rcn-fadeout{to{opacity:0}}" +
    "@keyframes rcn-pop{from{opacity:0;transform:scale(.88) translateY(10px)}to{opacity:1;transform:none}}" +
    "@keyframes rcn-rot{to{transform:rotate(360deg)}}" +
    "@keyframes rcn-draw{to{stroke-dashoffset:0}}" +
    "@keyframes rcn-slide{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}" +
    "@keyframes rcn-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var bg = null;
  var timer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function close() {
    if (timer) clearTimeout(timer);
    timer = null;
    var el = bg;
    bg = null;
    if (!el) return;
    el.classList.add("rcn-out");
    setTimeout(function () {
      el.remove();
    }, 260);
  }

  function render(kind, title, detail) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!bg) {
      bg = document.createElement("div");
      bg.className = "rcn-bg";
      bg.setAttribute("role", "alertdialog");
      bg.setAttribute("aria-live", "assertive");
      document.body.appendChild(bg);
    }
    var ico, extra;
    if (kind === "work") {
      ico = '<div class="rcn-ico rcn-spin"></div>';
      extra = '<div class="rcn-bar"><i></i></div>';
    } else if (kind === "ok") {
      ico = '<div class="rcn-ico rcn-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
      extra = "";
    } else {
      ico = '<div class="rcn-ico rcn-err"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></div>';
      extra = '<button type="button" class="rcn-btn">Entendido</button>';
    }
    bg.innerHTML =
      '<div class="rcn-card">' + ico + '<div class="rcn-t">' + esc(title) + "</div>" +
      (detail ? '<div class="rcn-d">' + esc(detail) + "</div>" : "") + extra + "</div>";
    var btn = bg.querySelector(".rcn-btn");
    if (btn) btn.addEventListener("click", close);
    if (kind === "ok") {
      bg.onclick = close;
      timer = setTimeout(close, 3200);
    } else {
      bg.onclick = null;
    }
  }

  window.rcNotice = {
    start: function (title, detail) {
      render("work", title || "Exportando…", detail || "");
    },
    update: function (title, detail) {
      render("work", title, detail || "");
    },
    success: function (title, detail) {
      render("ok", title, detail || "");
    },
    /* Los errores se quedan en pantalla hasta que la persona los cierre. */
    error: function (title, detail) {
      render("err", title, detail || "");
    },
    close: close,
  };
})();
