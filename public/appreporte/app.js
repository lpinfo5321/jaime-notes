(() => {
  try {
    const qs = new URLSearchParams(location.search);
    const noteId = qs.get("noteId") || "global";
    const initialCompanyName = (qs.get("companyName") || "").trim();
    const STORAGE_KEY = `returnedChecks.v3:${noteId}`;
    const legacyKeyV2 = `returnedChecks.v2:${noteId}`;
    const SCROLL_KEY = `returnedChecks.scrollY:${noteId}`;
    const SAVE_QUEUE_KEY = `rc:reportSaveQueue.v1:${noteId}`;

    let readySent = false;
    let initReceived = false;
    let userLabel = "";
    let lastServerOkAt = 0;
    let queuedCount = 0;
    let isOnline = true;
    const postReady = () => {
      if (readySent) return;
      readySent = true;
      if (!canPostToParent) return;
      try {
        window.parent.postMessage(
          { type: "rc:scrollRestored", noteId, scrollY: window.scrollY || 0 },
          "*",
        );
      } catch {}
    };
    const restoreScrollAndReady = () => {
      try {
        const y = Number(localStorage.getItem(SCROLL_KEY) || "0");
        // Espera a layout (2 RAF) para que el scroll exista.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              if (Number.isFinite(y) && y > 0) window.scrollTo(0, y);
            } catch {}
            postReady();
          });
        });
      } catch {
        postReady();
      }
    };

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
    const fmtTimeShort = (ts) => {
      try {
        return new Date(ts).toLocaleString(undefined, {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return "";
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

    // Defaults por compañía (para no re-escribir MAKER/PAYOR y COMPANY CONTACT cada vez)
    const normCompanyKey = (name) => String(name || "").trim().toUpperCase();
    const companyDefaultsKey = (name) => `rc:companyDefaults.v1:${normCompanyKey(name)}`;
    const readCompanyDefaults = (name) => {
      const keyName = normCompanyKey(name);
      if (!keyName) return null;
      try {
        const raw = localStorage.getItem(companyDefaultsKey(keyName));
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || typeof d !== "object") return null;
        return {
          makerPayor: typeof d.makerPayor === "string" ? d.makerPayor : "",
          companyContact: typeof d.companyContact === "string" ? d.companyContact : "",
        };
      } catch {
        return null;
      }
    };
    const writeCompanyDefaults = (name, patch) => {
      const keyName = normCompanyKey(name);
      if (!keyName) return;
      try {
        const prev = readCompanyDefaults(keyName) || { makerPayor: "", companyContact: "" };
        const next = {
          makerPayor:
            typeof patch?.makerPayor === "string" ? patch.makerPayor : prev.makerPayor,
          companyContact:
            typeof patch?.companyContact === "string"
              ? patch.companyContact
              : prev.companyContact,
          ts: Date.now(),
        };
        localStorage.setItem(companyDefaultsKey(keyName), JSON.stringify(next));
      } catch {}
    };

    const el = {
      paper: document.getElementById("paper"),
      lastSaved: document.getElementById("lastSaved"),
      btnPrint: document.getElementById("btnPrint"),
      btnPdf: document.getElementById("btnPdf"),
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
      importModal: document.getElementById("importModal"),
      importCancel: document.getElementById("importCancel"),
      importConfirm: document.getElementById("importConfirm"),
      importList: document.getElementById("importList"),
      importStatus: document.getElementById("importStatus"),
      importPreviewModal: document.getElementById("importPreviewModal"),
      importPreviewTitle: document.getElementById("importPreviewTitle"),
      importPreviewImg: document.getElementById("importPreviewImg"),
      importPreviewClose: document.getElementById("importPreviewClose"),
    };

    let report = null; // {id, createdAt, updatedAt, fields, images}
    let activePaper = null;
    let paperWired = false;
    let manageWired = false;
    let saveTimer = null;
    let saveApiTimer = null;
    let modalImageId = null;
    let manageKind = null; // "fee" | "check" | "reject"

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
    const defaultRejectList = () => [
      { id: uid(), label: "NSF", archived: false },
      { id: uid(), label: "DUPLICATE", archived: false },
      { id: uid(), label: "REFER TO MAKER", archived: false },
      { id: uid(), label: "STOP PAYMENT", archived: false },
      { id: uid(), label: "UNCOLLECT HOLD", archived: false },
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
        feePaymentMethod: "",
        feePaidNumbers: "",
        dateCheckPaid: "",
        checkPaymentMethod: "",
        checkPaidNumber: "",
        dateCompleted: "",
        agentCompleted: "",
      },
      lists: {
        feePayment: defaultFeeList(),
        checkPayment: defaultCheckList(),
        rejectReason: defaultRejectList(),
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
            rejectReason: Array.isArray(maybe.lists.rejectReason) ? maybe.lists.rejectReason : base.lists.rejectReason,
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
      if (!report.lists) report.lists = { feePayment: defaultFeeList(), checkPayment: defaultCheckList(), rejectReason: defaultRejectList() };
      if (!Array.isArray(report.lists.feePayment)) report.lists.feePayment = defaultFeeList();
      if (!Array.isArray(report.lists.checkPayment)) report.lists.checkPayment = defaultCheckList();
      if (!Array.isArray(report.lists.rejectReason)) report.lists.rejectReason = defaultRejectList();
      return kind === "fee"
        ? report.lists.feePayment
        : kind === "check"
          ? report.lists.checkPayment
          : report.lists.rejectReason;
    };

    const activeOptions = (kind) => getList(kind).filter((o) => o && !o.archived);

    const ensureSelectedDefaults = () => {
      // Intencionalmente NO ponemos "Pending" por default.
      // Vacío => el dropdown debe mostrar "Select".
      if (isBlankLike(report.fields.feePaymentMethod)) report.fields.feePaymentMethod = "";
      if (isBlankLike(report.fields.checkPaymentMethod)) report.fields.checkPaymentMethod = "";
      if (isBlankLike(report.fields.rejectReason)) report.fields.rejectReason = "";
    };

    const applyCompanyAutoFill = () => {
      try {
        const cname = normCompanyKey(report?.fields?.companyName);
        if (!cname) return;
        const defaults = readCompanyDefaults(cname);

        // MAKER/PAYOR: si está vacío, por default = nombre compañía
        if (!norm(report?.fields?.makerPayor)) {
          report.fields.makerPayor = defaults?.makerPayor ? defaults.makerPayor : cname;
        }

        // COMPANY CONTACT: si está vacío, usar el último guardado para esa compañía
        if (!norm(report?.fields?.companyContact) && defaults?.companyContact) {
          report.fields.companyContact = defaults.companyContact;
        }
      } catch {}
    };

    const buildSelectOptions = (selectEl, kind, currentLabel) => {
      if (!selectEl) return;
      const list = getList(kind);
      const active = list.filter((o) => o && !o.archived);
      const cur = norm(currentLabel);
      const hasCurActive = !!active.find((o) => eqi(o.label, cur));
      const hasCurAny = !!list.find((o) => eqi(o.label, cur));

      selectEl.innerHTML = "";

      // Placeholder
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "Select";
      selectEl.appendChild(ph);

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
      const pick = cur && (hasCurActive || hasCurAny) ? cur : "";
      selectEl.value = pick;
    };

    const renderPaymentSelects = () => {
      if (!activePaper) return;
      ensureSelectedDefaults();
      const feeSel = activePaper.querySelector('select[data-select="fee"]');
      const chkSel = activePaper.querySelector('select[data-select="check"]');
      const rejSel = activePaper.querySelector('select[data-select="reject"]');
      buildSelectOptions(feeSel, "fee", report.fields.feePaymentMethod);
      buildSelectOptions(chkSel, "check", report.fields.checkPaymentMethod);
      buildSelectOptions(rejSel, "reject", report.fields.rejectReason);

      // Extra field when Paid Check is selected (check number)
      const extraCheck = activePaper.querySelector('[data-extra="checkPaidNumber"]');
      const showCheck = eqi(report?.fields?.checkPaymentMethod, "Paid Check");
      if (extraCheck) extraCheck.style.display = showCheck ? "block" : "none";

      const extraFee = activePaper.querySelector('[data-extra="feePaidNumbers"]');
      const showFee = eqi(report?.fields?.feePaymentMethod, "Paid Check");
      if (extraFee) extraFee.style.display = showFee ? "block" : "none";

      // If extras are visible, tighten print layout to avoid cutting.
      const anyExtra = !!(showCheck || showFee);
      try {
        activePaper.classList.toggle("hasExtras", anyExtra);
      } catch {}
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
      try {
        updateStatusPill({ phase: silent ? "savedLocal" : "saving" });
      } catch {}

      if (canPostToParent) {
        try {
          // Parent will handle server save + ack back.
          window.parent.postMessage({ type: "rc:save", noteId, payload: report }, "*");
        } catch {}
      } else {
        // Si se usa en pestaña (sin iframe), también guardar en el servidor
        // para que "Duplicar" copie la info correcta.
        if (noteId && noteId !== "global") queueSaveToServer(report);
      }

      // Guardar defaults por compañía (solo si hay datos)
      try {
        const cname = report?.fields?.companyName || "";
        const mp = norm(report?.fields?.makerPayor);
        const cc = norm(report?.fields?.companyContact);
        if (mp || cc) writeCompanyDefaults(cname, { makerPayor: mp, companyContact: cc });
      } catch {}
    };

    const readQueue = () => {
      try {
        const raw = localStorage.getItem(SAVE_QUEUE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const writeQueue = (arr) => {
      try {
        localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(arr));
      } catch {}
      queuedCount = Array.isArray(arr) ? arr.length : 0;
    };

    const updateStatusPill = ({ phase }) => {
      if (!el.lastSaved) return;
      isOnline = typeof navigator !== "undefined" ? !!navigator.onLine : true;
      const baseEdited = report?.updatedAt ? fmtDateTime(report.updatedAt) : "—";
      const who = userLabel ? ` • ${userLabel}` : "";
      const q = queuedCount ? ` • cola: ${queuedCount}` : "";

      el.lastSaved.classList.remove("pillOk", "pillWarn", "pillBad", "pillStrong");
      if (!isOnline) {
        el.lastSaved.classList.add("pillBad");
        el.lastSaved.textContent = `Sin conexión (guardado local) • ${baseEdited}${q}${who}`;
        return;
      }
      if (phase === "saving") {
        el.lastSaved.classList.add("pillWarn");
        el.lastSaved.textContent = `Guardando… • ${baseEdited}${q}${who}`;
        return;
      }
      if (queuedCount > 0) {
        el.lastSaved.classList.add("pillWarn");
        el.lastSaved.textContent = `Pendiente de sincronizar • ${baseEdited}${q}${who}`;
        return;
      }
      if (lastServerOkAt > 0) {
        el.lastSaved.classList.add("pillOk");
        el.lastSaved.textContent = `Guardado • ${baseEdited} • Sync: ${fmtTimeShort(lastServerOkAt)}${who}`;
        return;
      }
      el.lastSaved.classList.add("pillStrong");
      el.lastSaved.textContent = `Última edición: ${baseEdited}${who}`;
    };

    const enqueuePayload = (payload) => {
      const q = readQueue();
      // Keep only last 5, latest wins.
      const next = [...q, { ts: Date.now(), payload }].slice(-5);
      writeQueue(next);
      try {
        updateStatusPill({ phase: "savedLocal" });
      } catch {}
    };

    const flushQueue = async () => {
      if (canPostToParent) return;
      if (!noteId || noteId === "global") return;
      if (!navigator.onLine) return;
      const q = readQueue();
      if (!q.length) return;
      // Send oldest->newest, but only keep last success.
      for (const item of q) {
        try {
          const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payload: item.payload }),
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("sync failed");
        } catch {
          // stop; we'll retry later
          try {
            updateStatusPill({ phase: "savedLocal" });
          } catch {}
          return;
        }
      }
      writeQueue([]);
      lastServerOkAt = Date.now();
      try {
        updateStatusPill({ phase: "savedLocal" });
      } catch {}
    };

    const queueSaveToServer = (payload) => {
      try {
        clearTimeout(saveApiTimer);
        saveApiTimer = setTimeout(async () => {
          try {
            if (!navigator.onLine) throw new Error("offline");
            const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ payload }),
              credentials: "same-origin",
            });
            if (!res.ok) throw new Error("save failed");
            lastServerOkAt = Date.now();
            // if there was a queue, try to flush it too
            await flushQueue();
            try {
              updateStatusPill({ phase: "savedLocal" });
            } catch {}
          } catch {
            enqueuePayload(payload);
          }
        }, 500);
      } catch {
        enqueuePayload(payload);
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
              (key === "feePaymentMethod" || key === "checkPaymentMethod" || key === "rejectReason") &&
              String(t.value || "") === "__manage__"
            ) {
              openManage(
                key === "feePaymentMethod"
                  ? "fee"
                  : key === "checkPaymentMethod"
                    ? "check"
                    : "reject",
              );
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

            if (key === "rejectReason" && t && String(t.tagName || "") === "SELECT") {
              report.fields.rejectReason = t.value ?? "";
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
              try { writeCompanyDefaults(report?.fields?.companyName, { companyContact: next }); } catch {}
              scheduleSave();
              return;
            }

            // MAKER/PAYOR: guardar como default para esta compañía
            if (key === "makerPayor") {
              report.fields[key] = t.value ?? "";
              try { writeCompanyDefaults(report?.fields?.companyName, { makerPayor: String(report.fields.makerPayor || "") }); } catch {}
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

            // Check numbers when Paid Check (allow multiple separated by spaces)
            if (key === "checkPaidNumber") {
              const raw = String(t.value || "");
              const tokens = raw
                .replace(/#/g, " ")
                .replace(/[^0-9\s]/g, " ")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 10);
              const pretty = tokens.length ? tokens.map((x) => "#" + x).join(" ") : "";
              if (t.value !== pretty) t.value = pretty;
              report.fields[key] = pretty;
              scheduleSave();
              return;
            }

            // Multiple check numbers (space-separated) for Fee Paid Check
            if (key === "feePaidNumbers") {
              const raw = String(t.value || "");
              const tokens = raw
                .replace(/#/g, " ")
                .replace(/[^0-9\s]/g, " ")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 10);
              const pretty = tokens.length ? tokens.map((x) => "#" + x).join(" ") : "";
              if (t.value !== pretty) t.value = pretty;
              report.fields[key] = pretty;
              scheduleSave();
              return;
            }

            report.fields[key] = t.value ?? "";
            if (key === "companyName") {
              try { applyCompanyAutoFill(); } catch {}
            }
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
                const raw = String(t.value || "");
                const tokens = raw
                  .replace(/#/g, " ")
                  .replace(/[^0-9\s]/g, " ")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 10);
                const pretty = tokens.length ? tokens.map((x) => "#" + x).join(" ") : "";
                t.value = pretty;
                report.fields[key] = pretty;
                scheduleSave();
              }

              if (key === "feePaidNumbers") {
                const raw = String(t.value || "");
                const tokens = raw
                  .replace(/#/g, " ")
                  .replace(/[^0-9\s]/g, " ")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 10);
                const pretty = tokens.length ? tokens.map((x) => "#" + x).join(" ") : "";
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
          if (manageKind === "reject" && eqi(report.fields.rejectReason, prev)) report.fields.rejectReason = n;

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
          kind === "fee"
            ? "Editar lista (Check Fee)"
            : kind === "check"
              ? "Editar lista (Check Amount)"
              : "Editar lista (Reject Reason)";
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

    const PDFJS_VERSION = "2.16.105";
    const ensurePdfJs = async () => {
      if (window.pdfjsLib && window.pdfjsLib.getDocument) return window.pdfjsLib;
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("No se pudo cargar PDF.js"));
        document.head.appendChild(s);
      });
      const lib = window.pdfjsLib;
      if (!lib || !lib.getDocument) throw new Error("PDF.js no disponible");
      try {
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
      } catch {}
      return lib;
    };

    const HTML2CANVAS_VERSION = "1.4.1";
    const ensureHtml2Canvas = async () => {
      if (window.html2canvas) return window.html2canvas;
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/${HTML2CANVAS_VERSION}/html2canvas.min.js`;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("No se pudo cargar html2canvas"));
        document.head.appendChild(s);
      });
      if (!window.html2canvas) throw new Error("html2canvas no disponible");
      return window.html2canvas;
    };

    const JSPDF_VERSION = "2.5.1";
    const ensureJsPdf = async () => {
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/jspdf/${JSPDF_VERSION}/jspdf.umd.min.js`;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
        document.head.appendChild(s);
      });
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF no disponible");
      return window.jspdf;
    };

    const exportPdfBlob = async () => {
      const html2canvas = await ensureHtml2Canvas();
      const jspdf = await ensureJsPdf();
      const { jsPDF } = jspdf;

      const pages = [
        document.getElementById("paper"),
        ...Array.from(document.querySelectorAll("#imagePages .imagePaper")),
      ].filter(Boolean);

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        const elPage = pages[i];
        if (!elPage) continue;
        if (i > 0) doc.addPage();

        const canvas = await html2canvas(elPage, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          onclone: (clonedDoc) => {
            try {
              clonedDoc.body.classList.add("rc-export");
            } catch {}
          },
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const imgW = canvas.width;
        const imgH = canvas.height;
        const scale = Math.min(pageW / imgW, pageH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;
        doc.addImage(imgData, "JPEG", x, y, drawW, drawH);
      }

      return doc.output("blob");
    };

    const readFileAsArrayBuffer = (file) =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("read error"));
        r.onload = () => resolve(r.result);
        r.readAsArrayBuffer(file);
      });

    const pdfToImages = async (file) => {
      const pdfjsLib = await ensurePdfJs();
      const buf = await readFileAsArrayBuffer(file);
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const maxPages = Math.min(doc.numPages || 1, 12);
      if ((doc.numPages || 1) > maxPages) {
        try {
          alert(`Este PDF tiene ${doc.numPages} páginas. Se importarán solo las primeras ${maxPages}.`);
        } catch {}
      }
      const out = [];
      for (let p = 1; p <= maxPages; p++) {
        const page = await doc.getPage(p);
        const baseVp = page.getViewport({ scale: 1 });
        const targetW = 1400; // buen balance calidad/peso
        const scale = Math.min(2.0, Math.max(1.0, targetW / Math.max(1, baseVp.width)));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        out.push({
          id: uid(),
          name: `${file.name} - p${p}`,
          dataUrl,
          createdAt: nowISO(),
        });
        // liberar
        try {
          canvas.width = 1;
          canvas.height = 1;
        } catch {}
      }
      return out;
    };

    const renderImages = () => {
      const imgs = report.images || [];
      if (el.attCount) el.attCount.textContent = `${imgs.length} image(s)`;
      if (el.imagePages) el.imagePages.innerHTML = "";
      try {
        document.body.classList.toggle("rc-noimages", !imgs.length);
      } catch {}
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

    let importQueue = []; // staged images [{id,name,dataUrl,createdAt}]

    const openImportPreview = (im) => {
      try {
        if (!im) return;
        if (el.importPreviewTitle) el.importPreviewTitle.textContent = im.name || "Vista previa";
        if (el.importPreviewImg) el.importPreviewImg.src = im.dataUrl || "";
        el.importPreviewModal?.classList?.add("show");
      } catch {}
    };
    const closeImportPreview = () => {
      try {
        el.importPreviewModal?.classList?.remove("show");
        if (el.importPreviewImg) el.importPreviewImg.src = "";
      } catch {}
    };

    const closeImport = () => {
      try { el.importModal?.classList?.remove("show"); } catch {}
      importQueue = [];
      if (el.importList) el.importList.innerHTML = "";
    };

    const moveImportItem = (from, to) => {
      if (from < 0 || from >= importQueue.length) return;
      if (to < 0 || to >= importQueue.length) return;
      const next = importQueue.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      importQueue = next;
      renderImportList();
    };

    const removeImportItem = (idx) => {
      if (idx < 0 || idx >= importQueue.length) return;
      importQueue = importQueue.filter((_, i) => i !== idx);
      renderImportList();
    };

    const renderImportList = () => {
      if (!el.importList) return;
      el.importList.innerHTML = "";
      const total = importQueue.length;
      if (el.importStatus) {
        el.importStatus.textContent = total ? `Listo: ${total} item(s)` : "Sin items";
      }
      for (let i = 0; i < importQueue.length; i++) {
        const im = importQueue[i];
        const row = document.createElement("div");
        row.className = "importItem";
        row.draggable = true;
        row.setAttribute("data-idx", String(i));

        row.addEventListener("dragstart", (ev) => {
          try {
            ev.dataTransfer?.setData?.("text/plain", String(i));
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
            row.classList.add("dragging");
          } catch {}
        });
        row.addEventListener("dragend", () => {
          try { row.classList.remove("dragging"); } catch {}
        });
        row.addEventListener("dragover", (ev) => {
          try {
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
          } catch {}
        });
        row.addEventListener("dragenter", (ev) => {
          try {
            ev.preventDefault();
            row.classList.add("dragOver");
          } catch {}
        });
        row.addEventListener("dragleave", () => {
          try { row.classList.remove("dragOver"); } catch {}
        });
        row.addEventListener("drop", (ev) => {
          try {
            ev.preventDefault();
            row.classList.remove("dragOver");
            const rawFrom = ev.dataTransfer?.getData?.("text/plain");
            const from = Number(rawFrom);
            const to = i;
            if (!Number.isFinite(from)) return;
            if (from === to) return;
            moveImportItem(from, to);
          } catch {}
        });

        const th = document.createElement("div");
        th.className = "importThumb";
        const img = document.createElement("img");
        img.src = im.dataUrl;
        img.alt = im.name || "preview";
        th.appendChild(img);
        th.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openImportPreview(im);
        });

        const meta = document.createElement("div");
        meta.className = "importMeta";
        const nm = document.createElement("div");
        nm.className = "importName";
        nm.textContent = im.name || "Item";
        nm.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openImportPreview(im);
        });
        const hint = document.createElement("div");
        hint.className = "importHint";
        hint.textContent = `#${i + 1}`;
        meta.appendChild(nm);
        meta.appendChild(hint);

        const actions = document.createElement("div");
        actions.className = "importActions";

        const up = document.createElement("button");
        up.type = "button";
        up.className = "miniBtnGhost";
        up.textContent = "↑";
        up.disabled = i === 0;
        up.addEventListener("click", () => moveImportItem(i, i - 1));

        const down = document.createElement("button");
        down.type = "button";
        down.className = "miniBtnGhost";
        down.textContent = "↓";
        down.disabled = i === importQueue.length - 1;
        down.addEventListener("click", () => moveImportItem(i, i + 1));

        const del = document.createElement("button");
        del.type = "button";
        del.className = "miniBtnGhost miniBtnDangerOutline";
        del.textContent = "Borrar";
        del.addEventListener("click", () => removeImportItem(i));

        actions.appendChild(up);
        actions.appendChild(down);
        actions.appendChild(del);

        row.appendChild(th);
        row.appendChild(meta);
        row.appendChild(actions);
        el.importList.appendChild(row);
      }
    };

    const openImport = () => {
      try { el.importModal?.classList?.add("show"); } catch {}
      renderImportList();
    };

    const stageFilesForImport = async (files) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      importQueue = [];
      openImport();
      if (el.importStatus) el.importStatus.textContent = "Preparando…";
      for (const f of list) {
        try {
          const isPdf =
            String(f.type || "").toLowerCase() === "application/pdf" ||
            String(f.name || "").toLowerCase().endsWith(".pdf");
          if (isPdf) {
            if (el.importStatus) el.importStatus.textContent = `Importando PDF: ${f.name}…`;
            const pages = await pdfToImages(f);
            importQueue.push(...pages);
          } else {
            const dataUrl = await fileToCompressedDataUrl(f);
            importQueue.push({ id: uid(), name: f.name, dataUrl, createdAt: nowISO() });
          }
        } catch {}
        renderImportList();
      }
      renderImportList();
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

    const parseTime = (iso) => {
      try {
        const t = Date.parse(String(iso || ""));
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    };

    const hydrateFromServer = async () => {
      // Solo si hay noteId real (no "global") y estamos en la misma app (cookies)
      if (!noteId || noteId === "global") return;
      try {
        if (el.lastSaved) el.lastSaved.textContent = "Sincronizando…";
      } catch {}
      try {
        const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const serverPayload = json?.payload ?? null;
        const serverUpdatedAt = json?.updatedAt ?? serverPayload?.updatedAt ?? null;

        // Si el server no tiene nada, no hacer nada.
        if (!serverPayload) return;

        const serverNorm = normalizeFromLegacy(serverPayload);
        const next = ensureReportShape(serverNorm || serverPayload || null);
        const localT = parseTime(report?.updatedAt);
        const serverT = parseTime(serverUpdatedAt) || parseTime(next?.updatedAt);

        // Regla: si el servidor es más reciente, reemplazar.
        // Si local es más reciente, dejamos local (pero igual persistimos al server por scheduleSave).
        if (serverT > localT) {
          report = ensureReportShape(next);
          ensureSelectedDefaults();
          if (initialCompanyName && report?.fields) {
            report.fields.companyName = initialCompanyName.toUpperCase();
          }
          computeTotalDue();
          persist(true);
          renderPaper();
          renderImages();
        } else {
          // Si local parece vacío pero server tiene campos, también reemplazamos
          const localMaker = String(report?.fields?.makerPayor || "").trim();
          const localComp = String(report?.fields?.companyContact || "").trim();
          const serverMaker = String(next?.fields?.makerPayor || next?.fields?.maker_payor || "").trim();
          const serverComp = String(next?.fields?.companyContact || next?.fields?.company_contact || "").trim();
          if ((!localMaker && serverMaker) || (!localComp && serverComp)) {
            report = ensureReportShape(next);
            ensureSelectedDefaults();
            computeTotalDue();
            persist(true);
            renderPaper();
            renderImages();
          }
        }
      } catch {
        // ignore
      } finally {
        try {
          if (el.lastSaved) el.lastSaved.textContent = `Última edición: ${fmtDateTime(report?.updatedAt)}`;
        } catch {}
      }
    };

    window.addEventListener("message", (ev) => {
      let data = ev?.data;
      if (!data || typeof data !== "object") return;
      try {
        if (data.type === "rc:setUserLabel") {
          userLabel = String((data).label ?? "").trim();
          try { updateStatusPill({ phase: "savedLocal" }); } catch {}
          return;
        }
        if (data.type === "rc:serverSaved") {
          if (data.noteId && String(data.noteId) !== String(noteId)) return;
          lastServerOkAt = Number((data).at || Date.now());
          queuedCount = Number((data).queued || 0) || 0;
          if (typeof (data).label === "string") userLabel = (data).label;
          try { updateStatusPill({ phase: "savedLocal" }); } catch {}
          return;
        }
        if (data.type === "rc:serverSaveFailed") {
          if (data.noteId && String(data.noteId) !== String(noteId)) return;
          queuedCount = Number((data).queued || queuedCount) || queuedCount;
          try { updateStatusPill({ phase: "savedLocal" }); } catch {}
          return;
        }
        if (data.type === "rc:flushNow") {
          if (data.noteId && String(data.noteId) !== String(noteId)) return;
          const requestId = data.requestId || null;
          try {
            persist(true);
            renderPaper();
            renderImages();
          } catch {}
          if (canPostToParent) {
            try {
              window.parent.postMessage({ type: "rc:flushed", noteId, requestId }, "*");
            } catch {}
          }
          return;
        }
        if (data.type === "rc:setCompanyName") {
          const name = String(data.companyName ?? "").trim();
          if (name && report?.fields) {
            report.fields.companyName = name.toUpperCase();
            try { applyCompanyAutoFill(); } catch {}
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
        initReceived = true;
        const norm = normalizeFromLegacy(data.initialReport);
        report = ensureReportShape(norm || report || null);
        ensureSelectedDefaults();
        if (initialCompanyName && report?.fields) {
          report.fields.companyName = initialCompanyName.toUpperCase();
        }
        try { applyCompanyAutoFill(); } catch {}
        computeTotalDue();
        persist(true);
        renderPaper();
        renderImages();
        restoreScrollAndReady();
      } catch {
        report = ensureReportShape(null);
        computeTotalDue();
        renderPaper();
        restoreScrollAndReady();
      }
    });

    // Online/offline status + autosync
    try {
      isOnline = typeof navigator !== "undefined" ? !!navigator.onLine : true;
      queuedCount = readQueue().length;
      updateStatusPill({ phase: "savedLocal" });
      window.addEventListener("online", () => {
        try { updateStatusPill({ phase: "savedLocal" }); } catch {}
        void flushQueue();
      });
      window.addEventListener("offline", () => {
        try { updateStatusPill({ phase: "savedLocal" }); } catch {}
      });
    } catch {}

    el.btnAddImages?.addEventListener?.("click", () => el.imgPicker?.click?.());
    el.imgPicker?.addEventListener?.("change", async (e) => {
      await stageFilesForImport(e.target.files);
      el.imgPicker.value = "";
    });

    // Import modal controls
    el.importCancel?.addEventListener?.("click", closeImport);
    el.importModal?.addEventListener?.("click", (e) => {
      if (e.target === el.importModal) closeImport();
    });
    el.importConfirm?.addEventListener?.("click", () => {
      if (!importQueue.length) return closeImport();
      report.images = report.images || [];
      // Insertar primero respetando el orden elegido
      report.images = [...importQueue, ...(report.images || [])];
      scheduleSave();
      renderImages();
      closeImport();
    });

    // Import preview modal controls
    el.importPreviewClose?.addEventListener?.("click", closeImportPreview);
    el.importPreviewModal?.addEventListener?.("click", (e) => {
      if (e.target === el.importPreviewModal) closeImportPreview();
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

    el.btnPdf?.addEventListener?.("click", async () => {
      try {
        await waitForImagesReady();
      } catch {}
      try {
        if (el.lastSaved) el.lastSaved.textContent = "Exportando PDF…";
      } catch {}
      try {
        const cname = String(report?.fields?.companyName || "").trim() || "Reporte";
        const blob = await exportPdfBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Returned Checks - ${cname}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        try {
          alert(e instanceof Error ? e.message : "No se pudo exportar PDF");
        } catch {}
      } finally {
        try {
          updateStatusPill({ phase: "savedLocal" });
        } catch {}
      }
    });

    // Allow parent to request a PDF for bulk-export (returns ArrayBuffer)
    window.addEventListener("message", async (ev) => {
      const data = ev?.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "rc:exportPdf") return;
      if (data.noteId && String(data.noteId) !== String(noteId)) return;
      const requestId = data.requestId || null;
      try {
        await waitForImagesReady();
      } catch {}
      try {
        const cname = String(report?.fields?.companyName || "").trim() || "Reporte";
        const blob = await exportPdfBlob();
        const buf = await blob.arrayBuffer();
        if (canPostToParent) {
          window.parent.postMessage(
            { type: "rc:exportPdfResult", noteId, requestId, ok: true, filename: `Returned Checks - ${cname}.pdf`, buffer: buf },
            "*",
            [buf],
          );
        }
      } catch (e) {
        if (canPostToParent) {
          try {
            window.parent.postMessage(
              { type: "rc:exportPdfResult", noteId, requestId, ok: false, error: e instanceof Error ? e.message : "export failed" },
              "*",
            );
          } catch {}
        }
      }
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
    try { applyCompanyAutoFill(); } catch {}
    computeTotalDue();
    ensureSelectedDefaults();
    persist(true);
    renderPaper();
    renderImages();
    if (el.lastSaved) el.lastSaved.textContent = `Última edición: ${fmtDateTime(report.updatedAt)}`;

    // Siempre intentar hidratar desde servidor para evitar "vacío y luego aparece"
    // (por desincronización de localStorage vs DB).
    hydrateFromServer();

    // Si nadie manda rc:init (pestaña directa), igual restaura/avisa.
    setTimeout(() => {
      if (!initReceived) restoreScrollAndReady();
    }, 50);

    try {
      let st = null;
      window.addEventListener(
        "scroll",
        () => {
          if (st) clearTimeout(st);
          st = setTimeout(() => {
            try {
              localStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
            } catch {}
          }, 120);
        },
        { passive: true },
      );
    } catch {}

    // (No separate "Editar lista" buttons; now it's inside the dropdown option)
  } catch {
    const root = document.getElementById("paper");
    if (root) {
      root.innerHTML =
        "<div style='padding:14px'><b>Error cargando el reporte.</b><div style='opacity:.7;margin-top:6px'>Intenta recargar la página.</div></div>";
    }
  }
})();

