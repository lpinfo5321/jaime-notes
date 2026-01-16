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

    const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
    const formatUsDatePartial = (raw) => {
      const d = onlyDigits(raw).slice(0, 6); // MMDDYY
      const mm = d.slice(0, 2);
      const dd = d.slice(2, 4);
      const yy = d.slice(4, 6);
      let out = "";
      if (mm) out += mm;
      if (dd) out += (out ? "/" : "") + dd;
      if (yy) out += (out ? "/" : "") + yy;
      return out;
    };

    const sanitizeMoneyTyping = (raw) => {
      // allow digits and one dot, no $ while typing
      let s = String(raw || "");
      s = s.replace(/[^0-9.]/g, "");
      const parts = s.split(".");
      if (parts.length <= 1) return parts[0].slice(0, 10);
      const intPart = parts[0].slice(0, 10);
      const decPart = parts.slice(1).join("").slice(0, 2);
      return decPart.length ? `${intPart}.${decPart}` : intPart;
    };

    const formatPhonePartial = (raw) => {
      const d = onlyDigits(raw).slice(0, 10);
      const a = d.slice(0, 3);
      const b = d.slice(3, 6);
      const c = d.slice(6, 10);
      let out = "";
      if (a) out += a;
      if (b) out += (out ? "-" : "") + b;
      if (c) out += (out ? "-" : "") + c;
      return out;
    };

    const formatNamePhonePartial = (raw) => {
      const s = String(raw || "");
      const digits = onlyDigits(s);
      const phone = formatPhonePartial(digits);
      const name = s.replace(/[0-9]/g, "").replace(/[-()]/g, "").replace(/\s+/g, " ").trim();
      if (!phone) return name;
      if (!name) return phone;
      return `${name} ${phone}`;
    };

    const sanitizeDigitsOnly = (raw, maxLen = 12) => onlyDigits(raw).slice(0, maxLen);
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
      manageModal: document.getElementById("manageModal"),
      manageTitle: document.getElementById("manageTitle"),
      manageClose: document.getElementById("manageClose"),
      manageAddInput: document.getElementById("manageAddInput"),
      manageAddBtn: document.getElementById("manageAddBtn"),
      manageList: document.getElementById("manageList"),
    };

    let report = null; // {id, createdAt, updatedAt, fields, images}
    let activePaper = null;
    let paperWired = false;
    let manageWired = false;
    let saveTimer = null;
    let modalImageId = null;
    let manageKind = null; // "fee" | "check"

    const defaultFeeList = () => [
      { id: uid(), label: "Pending", archived: false },
      { id: uid(), label: "Paid Cash", archived: false },
      { id: uid(), label: "Paid Check", archived: false },
    ];
    const defaultCheckList = () => [
      { id: uid(), label: "Pending", archived: false },
      { id: uid(), label: "Redeposited", archived: false },
      { id: uid(), label: "Paid Cash", archived: false },
      { id: uid(), label: "Paid Check", archived: false },
    ];

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
        feePaymentMethod: "Pending",
        dateCheckPaid: "",
        checkPaymentMethod: "Pending",
        checkPaidNumber: "",
        dateCompleted: "",
        agentCompleted: "",
      },
      lists: {
        feePayment: defaultFeeList(),
        checkPayment: defaultCheckList(),
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
        if (maybe.lists && typeof maybe.lists === "object") {
          out.lists = {
            feePayment: Array.isArray(maybe.lists.feePayment) ? maybe.lists.feePayment : base.lists.feePayment,
            checkPayment: Array.isArray(maybe.lists.checkPayment) ? maybe.lists.checkPayment : base.lists.checkPayment,
          };
        }
        if (Array.isArray(maybe.images)) out.images = maybe.images;
      } catch {
        return base;
      }
      return out;
    };

    const norm = (v) => String(v == null ? "" : v).trim();
    const eqi = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
    const isBlankLike = (v) => {
      const s = norm(v);
      if (!s) return true;
      return s.toUpperCase() === "RELLENAR";
    };

    const getList = (kind) => {
      report = ensureReportShape(report);
      if (!report.lists) report.lists = { feePayment: defaultFeeList(), checkPayment: defaultCheckList() };
      if (!Array.isArray(report.lists.feePayment)) report.lists.feePayment = defaultFeeList();
      if (!Array.isArray(report.lists.checkPayment)) report.lists.checkPayment = defaultCheckList();
      return kind === "fee" ? report.lists.feePayment : report.lists.checkPayment;
    };

    const activeOptions = (kind) => getList(kind).filter((o) => o && !o.archived);

    const ensureSelectedDefaults = () => {
      if (isBlankLike(report.fields.feePaymentMethod)) report.fields.feePaymentMethod = "Pending";
      if (isBlankLike(report.fields.checkPaymentMethod)) report.fields.checkPaymentMethod = "Pending";
    };

    const buildSelectOptions = (selectEl, kind, currentLabel) => {
      if (!selectEl) return;
      const list = getList(kind);
      const active = list.filter((o) => o && !o.archived);
      const cur = norm(currentLabel);
      const hasCurActive = !!active.find((o) => eqi(o.label, cur));
      const hasCurAny = !!list.find((o) => eqi(o.label, cur));

      selectEl.innerHTML = "";

      // Active options
      for (const opt of active) {
        const o = document.createElement("option");
        o.value = opt.label;
        o.textContent = opt.label;
        selectEl.appendChild(o);
      }

      // If current value is archived or unknown, keep it visible but not selectable.
      if (cur && (!hasCurActive || !hasCurAny)) {
        const o = document.createElement("option");
        o.value = cur;
        o.textContent = `${cur} (Archived)`;
        o.disabled = true;
        selectEl.appendChild(o);
      } else if (cur && !hasCurActive && hasCurAny) {
        const o = document.createElement("option");
        o.value = cur;
        o.textContent = `${cur} (Archived)`;
        o.disabled = true;
        selectEl.appendChild(o);
      }

      // Manage inside the dropdown
      const sep = document.createElement("option");
      sep.value = "__manage__";
      sep.textContent = "Editar lista…";
      selectEl.appendChild(sep);

      // pick selected value
      const pick = cur && (hasCurActive || hasCurAny) ? cur : (active[0]?.label || "Pending");
      selectEl.value = pick;
    };

    const renderPaymentSelects = () => {
      if (!activePaper) return;
      ensureSelectedDefaults();
      const feeSel = activePaper.querySelector('select[data-select="fee"]');
      const chkSel = activePaper.querySelector('select[data-select="check"]');
      buildSelectOptions(feeSel, "fee", report.fields.feePaymentMethod);
      buildSelectOptions(chkSel, "check", report.fields.checkPaymentMethod);

      // Extra field when Paid Check is selected (check number)
      const extra = activePaper.querySelector('[data-extra="checkPaidNumber"]');
      const show = eqi(report?.fields?.checkPaymentMethod, "Paid Check");
      if (extra) extra.style.display = show ? "block" : "none";
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
        if (inp.tagName === "INPUT" || inp.tagName === "SELECT") inp.value = val;
        if (key === "totalDue") inp.setAttribute("readonly", "readonly");
      });
      // Dropdowns
      renderPaymentSelects();
    };

    const renderPaper = () => {
      try {
        report = ensureReportShape(report);
        activePaper = el.paper;
        if (!activePaper) return;
        syncPaperFromReport();

        if (!paperWired) {
          paperWired = true;
          const onFieldChange = (e) => {
            const t = e.target;
            const key = t?.getAttribute?.("data-field");
            if (!key) return;
            if (key === "totalDue") return;

            // Dropdown manage option (inside select list)
            if (
              (key === "feePaymentMethod" || key === "checkPaymentMethod") &&
              String(t.value || "") === "__manage__"
            ) {
              openManage(key === "feePaymentMethod" ? "fee" : "check");
              // Restore select value
              try { renderPaymentSelects(); } catch {}
              return;
            }

            // Payment dropdowns: update immediately (incl. showing/hiding Check #)
            if (key === "feePaymentMethod" || key === "checkPaymentMethod") {
              report.fields[key] = t.value ?? "";
              try { renderPaymentSelects(); } catch {}
              scheduleSave();
              return;
            }
            // Date inputs: only numbers + auto slashes (MM/DD/YY)
            if (
              key === "dateCashed" ||
              key === "dateDeposit" ||
              key === "dateReturned" ||
              key === "dateFeePaid" ||
              key === "dateCheckPaid" ||
              key === "dateCompleted"
            ) {
              const next = formatUsDatePartial(t.value);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              scheduleSave();
              return;
            }

            // Money inputs: only numeric while typing, format on blur
            if (key === "checkAmount" || key === "returnedFee") {
              const next = sanitizeMoneyTyping(t.value);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              computeTotalDue();
              const totalEl = activePaper.querySelector('[data-field="totalDue"]');
              if (totalEl) totalEl.value = report.fields.totalDue;
              scheduleSave();
              return;
            }

            // Phone-only
            if (key === "customerContact") {
              const next = formatPhonePartial(t.value);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              scheduleSave();
              return;
            }

            // Name + phone mixed
            if (key === "companyContact") {
              const next = formatNamePhonePartial(t.value);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              scheduleSave();
              return;
            }

            // Digits-only fields
            if (key === "checkNumber") {
              const next = sanitizeDigitsOnly(t.value, 12);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              scheduleSave();
              return;
            }

            // Check number when Paid Check
            if (key === "checkPaidNumber") {
              const next = sanitizeDigitsOnly(t.value, 12);
              const pretty = next ? "#" + next : "";
              if (t.value !== pretty) t.value = pretty;
              report.fields[key] = pretty;
              scheduleSave();
              return;
            }

            report.fields[key] = t.value ?? "";
            if (key === "checkAmount" || key === "returnedFee") {
              computeTotalDue();
              const totalEl = activePaper.querySelector('[data-field="totalDue"]');
              if (totalEl) totalEl.value = report.fields.totalDue;
            }
            scheduleSave();
          };
          activePaper.addEventListener("input", onFieldChange);
          activePaper.addEventListener("change", onFieldChange);

          activePaper.addEventListener(
            "blur",
            (e) => {
              const t = e.target;
              if (!(t instanceof HTMLInputElement)) return;
              const key = t.getAttribute("data-field");
              if (!key) return;
              if (
                key === "dateCashed" ||
                key === "dateDeposit" ||
                key === "dateReturned" ||
                key === "dateFeePaid" ||
                key === "dateCheckPaid" ||
                key === "dateCompleted"
              ) {
                const pretty = formatUsDatePartial(t.value);
                t.value = pretty;
                report.fields[key] = pretty;
                scheduleSave();
                return;
              }
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

              if (key === "checkPaidNumber") {
                const digits = sanitizeDigitsOnly(t.value, 12);
                const pretty = digits ? "#" + digits : "";
                t.value = pretty;
                report.fields[key] = pretty;
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

    const closeManage = () => {
      manageKind = null;
      el.manageModal?.classList?.remove("show");
    };

    const renderManageList = () => {
      if (!manageKind || !el.manageList) return;
      const list = getList(manageKind);
      el.manageList.innerHTML = "";

      for (const item of list) {
        if (!item || typeof item.label !== "string") continue;
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";
        row.style.alignItems = "center";
        row.style.flexWrap = "wrap";
        row.style.border = "1px solid rgba(229,231,235,.95)";
        row.style.borderRadius = "14px";
        row.style.padding = "10px 12px";
        row.style.background = "#fff";

        const inp = document.createElement("input");
        inp.value = item.label + (item.archived ? " (Archived)" : "");
        inp.disabled = !!item.archived;
        inp.style.flex = "1";
        inp.style.minWidth = "220px";
        inp.style.border = "0";
        inp.style.outline = "0";
        inp.style.fontWeight = "900";

        const btnRename = document.createElement("button");
        btnRename.type = "button";
        btnRename.className = "btn";
        btnRename.textContent = "Renombrar";
        btnRename.disabled = !!item.archived;

        const btnArchive = document.createElement("button");
        btnArchive.type = "button";
        btnArchive.className = "btn";
        btnArchive.textContent = item.archived ? "Archivado" : "Eliminar";
        btnArchive.disabled = !!item.archived;

        btnRename.addEventListener("click", () => {
          const next = prompt("Nuevo nombre:", item.label);
          const n = norm(next);
          if (!n) return;
          // Prevent duplicates (case-insensitive) among active options
          if (getList(manageKind).some((o) => o && !o.archived && eqi(o.label, n))) return;

          const prev = item.label;
          item.label = n;
          // If the current report uses the old label, update it.
          if (manageKind === "fee" && eqi(report.fields.feePaymentMethod, prev)) report.fields.feePaymentMethod = n;
          if (manageKind === "check" && eqi(report.fields.checkPaymentMethod, prev)) report.fields.checkPaymentMethod = n;

          persist(true);
          renderPaymentSelects();
          renderManageList();
        });

        btnArchive.addEventListener("click", () => {
          const ok = confirm("¿Eliminar (archivar) esta opción?");
          if (!ok) return;
          item.archived = true;
          persist(true);
          renderPaymentSelects();
          renderManageList();
        });

        row.appendChild(inp);
        row.appendChild(btnRename);
        row.appendChild(btnArchive);
        el.manageList.appendChild(row);
      }
    };

    const openManage = (kind) => {
      manageKind = kind;
      if (el.manageTitle) {
        el.manageTitle.textContent =
          kind === "fee" ? "Editar lista (Check Fee)" : "Editar lista (Check Amount)";
      }
      if (el.manageAddInput) el.manageAddInput.value = "";
      el.manageModal?.classList?.add("show");
      renderManageList();
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
        ensureSelectedDefaults();
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

    // Manage options modal
    el.manageClose?.addEventListener?.("click", closeManage);
    el.manageModal?.addEventListener?.("click", (e) => {
      if (e.target === el.manageModal) closeManage();
    });
    el.manageAddBtn?.addEventListener?.("click", () => {
      if (!manageKind) return;
      const raw = norm(el.manageAddInput?.value);
      if (!raw) return;
      const list = getList(manageKind);
      if (list.some((o) => o && !o.archived && eqi(o.label, raw))) return;
      list.push({ id: uid(), label: raw, archived: false });
      if (el.manageAddInput) el.manageAddInput.value = "";
      persist(true);
      renderPaymentSelects();
      renderManageList();
    });

    report = load();
    computeTotalDue();
    ensureSelectedDefaults();
    persist(true);
    renderPaper();
    renderImages();
    if (el.lastSaved) el.lastSaved.textContent = `Última edición: ${fmtDateTime(report.updatedAt)}`;

    // (No separate "Editar lista" buttons; now it's inside the dropdown option)
  } catch {
    const root = document.getElementById("paper");
    if (root) {
      root.innerHTML =
        "<div style='padding:14px'><b>Error cargando el reporte.</b><div style='opacity:.7;margin-top:6px'>Intenta recargar la página.</div></div>";
    }
  }
})();

