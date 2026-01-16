(() => {
  try {
    const qs = new URLSearchParams(location.search);
    const noteId = qs.get("noteId") || "global";
    const initialCompanyName = (qs.get("companyName") || "").trim();
    const STORAGE_KEY = `returnedChecks.v3:${noteId}`;
    const legacyKeyV2 = `returnedChecks.v2:${noteId}`;

    const canPostToParent = (() => {
      try {
        return window.parent && window.parent !== window;
      } catch {
        return false;
      }
    })();

    const nowISO = () => new Date().toISOString();
    const fmtDateTime = (iso) => {
      try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return "—";
      }
    };
    const moneyToNumber = (v) => {
      if (v == null) return 0;
      const s = String(v).replace(/[^0-9.\-]/g, "").trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const formatMoney = (n) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return "";
      return "$" + x.toFixed(2);
    };
    const uid = () =>
      globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : "id-" + Math.random().toString(16).slice(2) + Date.now();

    const el = {
      paper: document.getElementById("paper"),
      lastSaved: document.getElementById("lastSaved"),
      btnPrint: document.getElementById("btnPrint"),
      btnAddImages: document.getElementById("btnAddImages"),
      imgPicker: document.getElementById("imgPicker"),
      imagePages: document.getElementById("imagePages"),
      imagesEmpty: document.getElementById("imagesEmpty"),
      attCount: document.getElementById("attCount"),
      modal: document.getElementById("modal"),
      modalImg: document.getElementById("modalImg"),
      modalTitle: document.getElementById("modalTitle"),
      modalClose: document.getElementById("modalClose"),
      modalDelete: document.getElementById("modalDelete"),
    };

    let report = null; // {id, createdAt, updatedAt, fields, images}
    let activePaper = null;
    let paperWired = false;
    let saveTimer = null;
    let modalImageId = null;

    const blankReport = () => ({
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      fields: {
        companyName: initialCompanyName ? initialCompanyName.toUpperCase() : "",
        dateCashed: "",
        dateDeposit: "",
        dateReturned: "",
        payee: "",
        checkNumber: "",
        makerPayor: "",
        rejectReason: "",
        customerContact: "",
        companyContact: "",
        checkAmount: "",
        returnedFee: "",
        totalDue: "$0.00",
        dateFeePaid: "",
        feePaymentMethod: "",
        dateCheckPaid: "",
        checkPaymentMethod: "",
        dateCompleted: "",
        agentCompleted: "",
      },
      images: [], // {id, name, dataUrl, createdAt}
    });

    const ensureReportShape = (maybe) => {
      const base = blankReport();
      if (!maybe || typeof maybe !== "object") return base;
      const out = { ...base };
      try {
        if (typeof maybe.id === "string" && maybe.id) out.id = maybe.id;
        if (typeof maybe.createdAt === "string" && maybe.createdAt)
          out.createdAt = maybe.createdAt;
        if (typeof maybe.updatedAt === "string" && maybe.updatedAt)
          out.updatedAt = maybe.updatedAt;

        if (maybe.fields && typeof maybe.fields === "object") {
          out.fields = { ...base.fields, ...maybe.fields };
        }
        if (Array.isArray(maybe.images)) out.images = maybe.images;
      } catch {
        return base;
      }
      return out;
    };

    const normalizeFromLegacy = (maybe) => {
      if (!maybe || typeof maybe !== "object") return null;
      if (Array.isArray(maybe.reports)) {
        const list = maybe.reports || [];
        const activeId = maybe.activeId || null;
        const pick = list.find((r) => r && r.id === activeId) || list[0] || null;
        if (pick && pick.fields) {
          return {
            id: pick.id || uid(),
            createdAt: pick.createdAt || nowISO(),
            updatedAt: pick.updatedAt || nowISO(),
            fields: pick.fields || {},
            images: pick.images || [],
          };
        }
      }
      if (maybe.fields && typeof maybe.fields === "object") {
        return {
          id: maybe.id || uid(),
          createdAt: maybe.createdAt || nowISO(),
          updatedAt: maybe.updatedAt || nowISO(),
          fields: maybe.fields || {},
          images: maybe.images || [],
        };
      }
      return null;
    };

    const persist = (silent = false) => {
      if (!report) return;
      report.updatedAt = nowISO();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
      } catch {}
      if (el.lastSaved) {
        el.lastSaved.textContent = silent
          ? `Última edición: ${fmtDateTime(report.updatedAt)}`
          : "Guardando…";
      }

      if (canPostToParent) {
        try {
          window.parent.postMessage({ type: "rc:save", noteId, payload: report }, "*");
        } catch {}
      }
    };

    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        persist(true);
      }, 350);
    };

    const computeTotalDue = () => {
      const total =
        moneyToNumber(report.fields.checkAmount) +
        moneyToNumber(report.fields.returnedFee);
      report.fields.totalDue = formatMoney(total);
    };

    const syncPaperFromReport = () => {
      if (!activePaper) return;
      const updated = activePaper.querySelector('[data-live="updatedAt"]');
      if (updated) updated.textContent = fmtDateTime(report?.updatedAt);

      const inputs = activePaper.querySelectorAll("[data-field]");
      inputs.forEach((inp) => {
        const key = inp.getAttribute("data-field");
        const val = (report?.fields || {})[key] ?? "";
        if (inp.tagName === "INPUT") inp.value = val;
        if (key === "totalDue") inp.setAttribute("readonly", "readonly");
      });
    };

    const renderPaper = () => {
      try {
        report = ensureReportShape(report);
        activePaper = el.paper;
        if (!activePaper) return;
        syncPaperFromReport();

        if (!paperWired) {
          paperWired = true;
          activePaper.addEventListener("input", (e) => {
            const t = e.target;
            const key = t?.getAttribute?.("data-field");
            if (!key) return;
            if (key === "totalDue") return;
            report.fields[key] = t.value ?? "";
            if (key === "checkAmount" || key === "returnedFee") {
              computeTotalDue();
              const totalEl = activePaper.querySelector('[data-field="totalDue"]');
              if (totalEl) totalEl.value = report.fields.totalDue;
            }
            scheduleSave();
          });

          activePaper.addEventListener(
            "blur",
            (e) => {
              const t = e.target;
              if (!(t instanceof HTMLInputElement)) return;
              const key = t.getAttribute("data-field");
              if (!key) return;
              if (key === "checkAmount" || key === "returnedFee") {
                const n = moneyToNumber(t.value);
                const pretty = formatMoney(n);
                t.value = pretty;
                report.fields[key] = pretty;
                computeTotalDue();
                const totalEl = activePaper.querySelector('[data-field="totalDue"]');
                if (totalEl) totalEl.value = report.fields.totalDue;
                scheduleSave();
              }
            },
            true,
          );
        }
      } catch {
        if (el.paper) {
          el.paper.innerHTML =
            "<div style='padding:14px'><b>Error cargando el reporte.</b><div style='opacity:.7;margin-top:6px'>Intenta recargar la página.</div></div>";
        }
      }
    };

    const fileToCompressedDataUrl = (file, maxSide = 1800, quality = 0.86) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read error"));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const w = img.width,
              h = img.height;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            const nw = Math.round(w * scale);
            const nh = Math.round(h * scale);
            const canvas = document.createElement("canvas");
            canvas.width = nw;
            canvas.height = nh;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, nw, nh);
            resolve(canvas.toDataURL("image/jpeg", quality));
          };
          img.onerror = () => reject(new Error("img error"));
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    };

    const renderImages = () => {
      const imgs = report.images || [];
      if (el.attCount) el.attCount.textContent = `${imgs.length} image(s)`;
      if (el.imagePages) el.imagePages.innerHTML = "";
      if (!imgs.length) {
        if (el.imagesEmpty) el.imagesEmpty.style.display = "block";
        return;
      }
      if (el.imagesEmpty) el.imagesEmpty.style.display = "none";
      for (const im of imgs) {
        const page = document.createElement("div");
        page.className = "paper imagePaper";

        const top = document.createElement("div");
        top.className = "imageTop";
        const left = document.createElement("div");
        left.style.minWidth = "0";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = im.name || "Image";
        const meta = document.createElement("div");
        meta.className = "metaSmall";
        meta.textContent = `Added: ${fmtDateTime(im.createdAt || report.updatedAt)}`;
        left.appendChild(name);
        left.appendChild(meta);

        const actions = document.createElement("div");
        const del = document.createElement("button");
        del.className = "miniBtn miniBtnDanger";
        del.textContent = "Borrar";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const ok = confirm("¿Borrar esta imagen?");
          if (!ok) return;
          report.images = (report.images || []).filter((x) => x.id !== im.id);
          scheduleSave();
          renderImages();
        });
        actions.appendChild(del);

        top.appendChild(left);
        top.appendChild(actions);

        const body = document.createElement("div");
        body.className = "imageBody";
        const img = document.createElement("img");
        img.src = im.dataUrl;
        img.alt = im.name || "image";
        img.addEventListener("click", () => {
          modalImageId = im.id;
          if (el.modalTitle) el.modalTitle.textContent = im.name || "Imagen";
          if (el.modalImg) el.modalImg.src = im.dataUrl;
          el.modal?.classList?.add("show");
        });
        body.appendChild(img);

        page.appendChild(top);
        page.appendChild(body);
        el.imagePages?.appendChild(page);
      }
    };

    const addImages = async (files) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      for (const f of list) {
        try {
          const dataUrl = await fileToCompressedDataUrl(f);
          report.images = report.images || [];
          report.images.unshift({ id: uid(), name: f.name, dataUrl, createdAt: nowISO() });
        } catch {}
      }
      scheduleSave();
      renderImages();
    };

    const waitForImagesReady = async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
        ),
      );
      await Promise.all(
        imgs.map((img) =>
          typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve(),
        ),
      );
      await new Promise((r) => requestAnimationFrame(() => r()));
    };

    const load = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const norm = normalizeFromLegacy(parsed);
          if (norm) return norm;
        } catch {}
      }
      const rawV2 = localStorage.getItem(legacyKeyV2);
      if (rawV2) {
        try {
          const parsed = JSON.parse(rawV2);
          const norm = normalizeFromLegacy(parsed);
          if (norm) return norm;
        } catch {}
      }
      return blankReport();
    };

    window.addEventListener("message", (ev) => {
      let data = ev?.data;
      if (!data || typeof data !== "object") return;
      try {
        if (data.type === "rc:setCompanyName") {
          const name = String(data.companyName ?? "").trim();
          if (name && report?.fields) {
            report.fields.companyName = name.toUpperCase();
            scheduleSave();
            renderPaper();
          }
          return;
        }
        if (data.type === "rc:preparePrint") {
          (async () => {
            try {
              await waitForImagesReady();
            } catch {}
            if (canPostToParent) {
              try {
                window.parent.postMessage({ type: "rc:prepared", noteId }, "*");
              } catch {}
            }
          })();
          return;
        }
        if (data.type !== "rc:init") return;
        if (data.noteId && String(data.noteId) !== String(noteId)) return;
        const norm = normalizeFromLegacy(data.initialReport);
        report = ensureReportShape(norm || report || null);
        if (initialCompanyName && report?.fields) {
          report.fields.companyName = initialCompanyName.toUpperCase();
        }
        computeTotalDue();
        persist(true);
        renderPaper();
        renderImages();
      } catch {
        report = ensureReportShape(null);
        computeTotalDue();
        renderPaper();
      }
    });

    el.btnAddImages?.addEventListener?.("click", () => el.imgPicker?.click?.());
    el.imgPicker?.addEventListener?.("change", async (e) => {
      await addImages(e.target.files);
      el.imgPicker.value = "";
    });

    el.btnPrint?.addEventListener?.("click", () => {
      if (canPostToParent) {
        try {
          window.parent.postMessage({ type: "rc:print", noteId }, "*");
        } catch {}
        return;
      }
      window.print();
    });

    el.modalClose?.addEventListener?.("click", () => {
      modalImageId = null;
      el.modal?.classList?.remove("show");
      if (el.modalImg) el.modalImg.src = "";
    });
    el.modal?.addEventListener?.("click", (e) => {
      if (e.target === el.modal) el.modalClose?.click?.();
    });
    el.modalDelete?.addEventListener?.("click", () => {
      if (!modalImageId) return;
      const ok = confirm("¿Borrar esta imagen?");
      if (!ok) return;
      report.images = (report.images || []).filter((im) => im.id !== modalImageId);
      modalImageId = null;
      el.modal?.classList?.remove("show");
      if (el.modalImg) el.modalImg.src = "";
      scheduleSave();
      renderImages();
    });

    report = load();
    computeTotalDue();
    persist(true);
    renderPaper();
    renderImages();
    if (el.lastSaved) el.lastSaved.textContent = `Última edición: ${fmtDateTime(report.updatedAt)}`;
  } catch {
    const root = document.getElementById("paper");
    if (root) {
      root.innerHTML =
        "<div style='padding:14px'><b>Error cargando el reporte.</b><div style='opacity:.7;margin-top:6px'>Intenta recargar la página.</div></div>";
    }
  }
})();

