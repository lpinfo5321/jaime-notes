(() => {
  try {
    const qs = new URLSearchParams(location.search);
    const noteId = qs.get("noteId") || "global";
    const initialCompanyName = (qs.get("companyName") || "").trim();
    const STORAGE_KEY = `returnedChecks.v3:${noteId}`;
    const legacyKeyV2 = `returnedChecks.v2:${noteId}`;
    const SCROLL_KEY = `returnedChecks.scrollY:${noteId}`;

    let readySent = false;
    let initReceived = false;
    // Se eliminó el modo offline/cola + el indicador de "Sync" para evitar confusión.
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
      // allow comma as decimal separator too (mobile ES keyboards)
      const s = String(v).replace(/,/g, ".").replace(/[^0-9.\-]/g, "").trim();
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
      // allow digits and one dot (or comma), no $ while typing
      let s = String(raw || "");
      s = s.replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const endsWithDot = s.endsWith(".");
      const parts = s.split(".");
      if (parts.length <= 1) return parts[0].slice(0, 10);
      const intPart = parts[0].slice(0, 10);
      const decPart = parts.slice(1).join("").slice(0, 2);
      if (decPart.length) return `${intPart}.${decPart}`;
      // Important UX: allow typing a trailing dot like "48."
      if (endsWithDot) return `${intPart || "0"}.`;
      return intPart;
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
      btnManageImages: document.getElementById("btnManageImages"),
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
      adminImagesModal: document.getElementById("adminImagesModal"),
      adminImagesClose: document.getElementById("adminImagesClose"),
      adminImagesList: document.getElementById("adminImagesList"),
      adminImagesStatus: document.getElementById("adminImagesStatus"),
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
        feeCashAmount: "",
        dateCheckPaid: "",
        checkPaymentMethod: "",
        checkPaidNumber: "",
        checkCashAmount: "",
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

    /* ── Custom dropdown helpers ── */
    let activeDropList = null;
    const closeAllDrops = () => {
      if (activeDropList) {
        activeDropList.remove();
        activeDropList = null;
      }
      document.querySelectorAll('.customDropBtn.open').forEach(b => b.classList.remove('open'));
    };
    document.addEventListener('click', closeAllDrops);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllDrops(); });

    const syncCustomDropdown = (sel) => {
      if (!sel) return;
      const wrap = sel.closest('.selectWrap');
      if (!wrap || !wrap.dataset.customized) return;
      const valSpan = wrap.querySelector('.customDropVal');
      if (!valSpan) return;
      const cur = Array.from(sel.options).find(o => o.value === sel.value);
      const isPlaceholder = !cur || !cur.value || cur.value === '__manage__';
      valSpan.textContent = isPlaceholder ? 'Select' : cur.text;
      valSpan.className = 'customDropVal' + (isPlaceholder ? ' placeholder' : '');
    };

    const initCustomDropdowns = () => {
      if (!activePaper) return;
      activePaper.querySelectorAll('.selectWrap select[data-select]').forEach(sel => {
        const wrap = sel.closest('.selectWrap');
        if (!wrap || wrap.dataset.customized) return;
        wrap.dataset.customized = '1';

        // Build trigger button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'customDropBtn';

        const valSpan = document.createElement('span');
        valSpan.className = 'customDropVal placeholder';
        valSpan.textContent = 'Select';

        const chevron = document.createElement('span');
        chevron.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

        btn.appendChild(valSpan);
        btn.appendChild(chevron);
        wrap.appendChild(btn);

        // Open dropdown on click
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (activeDropList) {
            const wasThis = activeDropList.dataset.forWrap === wrap.dataset.customized + sel.dataset.field;
            closeAllDrops();
            if (wasThis) return;
          }

          btn.classList.add('open');

          // Build list
          const list = document.createElement('div');
          list.className = 'customDropList';
          list.dataset.forWrap = wrap.dataset.customized + sel.dataset.field;

          // Icon map
          const icons = {
            'Pending':     '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            'Paid Cash':   '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
            'Paid Check':  '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
            'Redeposited': '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.4"/></svg>',
          };

          Array.from(sel.options).forEach((opt, i) => {
            if (opt.value === '__manage__') {
              const div = document.createElement('div');
              div.className = 'dropDivider';
              list.appendChild(div);
              const item = document.createElement('div');
              item.className = 'customDropItem manage';
              item.innerHTML = '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> Editar lista…';
              item.addEventListener('click', e => {
                e.stopPropagation();
                closeAllDrops();
                sel.value = '__manage__';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              });
              list.appendChild(item);
              return;
            }
            const item = document.createElement('div');
            item.className = 'customDropItem' + (opt.value === sel.value ? ' active' : '') + (opt.disabled ? ' disabled' : '');
            item.innerHTML = (icons[opt.text] || '<svg class="dropItemIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg>') + opt.text;
            if (!opt.disabled) {
              item.addEventListener('click', e => {
                e.stopPropagation();
                closeAllDrops();
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                syncCustomDropdown(sel);
              });
            }
            list.appendChild(item);
          });

          // Position
          const rect = btn.getBoundingClientRect();
          list.style.left = rect.left + 'px';
          list.style.top = (rect.bottom + 5) + 'px';
          list.style.minWidth = Math.max(rect.width, 200) + 'px';

          document.body.appendChild(list);
          activeDropList = list;
        });

        // Sync button text when native select changes
        sel.addEventListener('change', () => syncCustomDropdown(sel));
      });
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

      // Sync custom dropdown button labels
      syncCustomDropdown(feeSel);
      syncCustomDropdown(chkSel);
      syncCustomDropdown(rejSel);

      // Extra: Paid Check → check number
      const extraCheck = activePaper.querySelector('[data-extra="checkPaidNumber"]');
      const showCheck = eqi(report?.fields?.checkPaymentMethod, "Paid Check");
      if (extraCheck) extraCheck.style.display = showCheck ? "block" : "none";

      const extraFee = activePaper.querySelector('[data-extra="feePaidNumbers"]');
      const showFee = eqi(report?.fields?.feePaymentMethod, "Paid Check");
      if (extraFee) extraFee.style.display = showFee ? "block" : "none";

      // Extra: Paid Cash → cash amount field
      const extraFeeCash = activePaper.querySelector('[data-extra="feeCashAmount"]');
      const showFeeCash = eqi(report?.fields?.feePaymentMethod, "Paid Cash");
      if (extraFeeCash) extraFeeCash.style.display = showFeeCash ? "block" : "none";

      const extraCheckCash = activePaper.querySelector('[data-extra="checkCashAmount"]');
      const showCheckCash = eqi(report?.fields?.checkPaymentMethod, "Paid Cash");
      if (extraCheckCash) extraCheckCash.style.display = showCheckCash ? "block" : "none";

      // If extras are visible, tighten print layout to avoid cutting.
      const anyExtra = !!(showCheck || showFee || showFeeCash || showCheckCash);
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
      // Importante: no persistir base64 (dataUrl) en localStorage ni enviarlo al parent.
      // Esto mantiene la app rápida y evita payloads gigantes, pero igual permite preview instantáneo en memoria.
      const payloadToPersist = (() => {
        try {
          const imgs = Array.isArray(report.images) ? report.images : [];
          const cleanImgs = imgs.map((im) => {
            if (!im || typeof im !== "object") return im;
            const out = { ...im };
            // dataUrl solo es para preview local, no persistir.
            if (typeof out.dataUrl === "string") delete out.dataUrl;
            return out;
          });
          return { ...report, images: cleanImgs };
        } catch {
          return report;
        }
      })();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payloadToPersist));
      } catch {}

      if (canPostToParent) {
        try {
          // Parent will handle server save + ack back.
          window.parent.postMessage({ type: "rc:save", noteId, payload: payloadToPersist }, "*");
        } catch {}
      } else {
        // Si se usa en pestaña (sin iframe), también guardar en el servidor
        // para que "Duplicar" copie la info correcta.
        if (noteId && noteId !== "global") queueSaveToServer(payloadToPersist);
      }

      // Guardar defaults por compañía (solo si hay datos)
      try {
        const cname = report?.fields?.companyName || "";
        const mp = norm(report?.fields?.makerPayor);
        const cc = norm(report?.fields?.companyContact);
        if (mp || cc) writeCompanyDefaults(cname, { makerPayor: mp, companyContact: cc });
      } catch {}
    };

    const queueSaveToServer = (payload) => {
      try {
        clearTimeout(saveApiTimer);
        saveApiTimer = setTimeout(async () => {
          try {
            // Sin modo offline/cola: si no hay conexión, no intentamos guardar.
            if (!navigator.onLine) return;
            const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ payload }),
              credentials: "same-origin",
            });
            void res;
          } catch {
            // ignore
          }
        }, 500);
      } catch {
        // ignore
      }
    };

    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        persist(true);
      }, 350);
    };

    // Política de Returned Check Fee (según tabla física):
    // Up to $50 => $25
    // $50.01 to $300 => $30
    // $300.01 to $800 => $40
    // Over $800 => 5% of check amount
    const computeReturnedFee = () => {
      try {
        const amt = Math.max(0, moneyToNumber(report?.fields?.checkAmount));
        let fee = 0;
        if (amt <= 50) fee = 25;
        else if (amt <= 300) fee = 30;
        else if (amt <= 800) fee = 40;
        else fee = amt * 0.05;
        report.fields.returnedFee = formatMoney(fee);
      } catch {
        // ignore
      }
    };

    const computeTotalDue = () => {
      // Siempre recalcular la fee automáticamente a partir del Check Amount
      computeReturnedFee();
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
        if (key === "returnedFee") inp.setAttribute("readonly", "readonly");
      });
      // Dropdowns
      initCustomDropdowns();
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
            // Nota: returnedFee ahora se calcula solo (no editable).
            if (key === "returnedFee") return;
            if (key === "checkAmount") {
              const next = sanitizeMoneyTyping(t.value);
              if (t.value !== next) t.value = next;
              report.fields[key] = next;
              computeTotalDue();
              const feeEl = activePaper.querySelector('[data-field="returnedFee"]');
              if (feeEl) feeEl.value = report.fields.returnedFee;
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
            if (key === "checkAmount") {
              computeTotalDue();
              const feeEl = activePaper.querySelector('[data-field="returnedFee"]');
              if (feeEl) feeEl.value = report.fields.returnedFee;
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
              if (key === "returnedFee") {
                // returnedFee ahora es automático
                t.value = report.fields.returnedFee || "";
                return;
              }
              if (key === "checkAmount") {
                const n = moneyToNumber(t.value);
                const pretty = formatMoney(n);
                t.value = pretty;
                report.fields[key] = pretty;
                computeTotalDue();
                const feeEl = activePaper.querySelector('[data-field="returnedFee"]');
                if (feeEl) feeEl.value = report.fields.returnedFee;
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

      // Letter size in points (72pt = 1in)
      const LETTER_W = 612;
      const LETTER_H = 792;

      // Shared onclone handler: forces full 860px render width and white background
      const onclone = (clonedDoc) => {
        try {
          // White background — eliminates gradient/color tints
          clonedDoc.documentElement.style.background = "#fff";
          clonedDoc.body.style.background = "#fff";
          clonedDoc.body.classList.add("rc-export");

          // Hide topbar so it never bleeds into the capture
          const topbar = clonedDoc.querySelector(".topbar");
          if (topbar) topbar.style.display = "none";

          // Force all paper elements to full 860px width
          clonedDoc.querySelectorAll(".paper, .imagePaper").forEach((el) => {
            el.style.width = "860px";
            el.style.minWidth = "860px";
            el.style.maxWidth = "860px";
            el.style.background = "#ffffff";
          });

          // Ensure shell/wrapper is wide enough
          const shellEl = clonedDoc.querySelector(".shell");
          if (shellEl) {
            shellEl.style.minWidth = "900px";
            shellEl.style.padding = "14px";
            shellEl.style.background = "#fff";
          }
        } catch {}
      };

      // Build PDF — first page sets dimensions, subsequent pages added
      let doc = null;

      for (let i = 0; i < pages.length; i++) {
        const elPage = pages[i];
        if (!elPage) continue;

        const canvas = await html2canvas(elPage, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: false,
          windowWidth: 900,  // simulate desktop width
          onclone,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.93);
        const imgW = canvas.width;
        const imgH = canvas.height;

        // Scale to fill full letter width
        const scaleToW = LETTER_W / imgW;
        const drawW = LETTER_W;
        const drawH = imgH * scaleToW;

        // Choose page height: use letter if content fits, else match content exactly
        const pageH = drawH <= LETTER_H ? LETTER_H : drawH;

        if (i === 0) {
          doc = new jsPDF({ orientation: "portrait", unit: "pt", format: [LETTER_W, pageH] });
        } else {
          doc.addPage([LETTER_W, pageH]);
        }

        // Vertically center content only when page is taller than content
        const y = pageH > drawH ? (pageH - drawH) / 2 : 0;
        doc.addImage(imgData, "JPEG", 0, y, drawW, drawH);
      }

      if (!doc) throw new Error("No hay páginas para exportar");
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

    let hydratingFromServer = false;
    let hydratedAtLeastOnce = false;
    const hydrateImagesFromServer = async (opts = { allowReplaceIfEmpty: true, allowMergeUrls: true }) => {
      try {
        if (hydratingFromServer) return false;
        if (!noteId || noteId === "global") return false;
        if (!navigator.onLine) return false;
        hydratingFromServer = true;
        const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return false;
        const json = await res.json().catch(() => ({}));
        const payload = json?.payload || null;
        const serverImgs = Array.isArray(payload?.images) ? payload.images : [];
        const localImgs = Array.isArray(report?.images) ? report.images : [];

        // Si local está vacío pero server tiene imágenes, reemplazar (caso: Vercel/estado viejo).
        if (opts.allowReplaceIfEmpty && (!localImgs.length && serverImgs.length)) {
          report.images = serverImgs;
          hydratedAtLeastOnce = true;
          return true;
        }

        // Merge: rellenar urls firmadas por path (sin tocar el orden local).
        if (opts.allowMergeUrls && localImgs.length && serverImgs.length) {
          const byPath = new Map();
          for (const im of serverImgs) {
            const p = String(im?.path || "").trim();
            if (!p) continue;
            byPath.set(p, im);
          }
          report.images = localImgs.map((im) => {
            const p = String(im?.path || "").trim();
            if (!p) return im;
            const hasUrl = typeof im?.url === "string" && String(im.url).trim();
            const hasData = typeof im?.dataUrl === "string" && String(im.dataUrl).startsWith("data:image/");
            if (hasUrl || hasData) return im;
            const s = byPath.get(p);
            const nextUrl = s && typeof s.url === "string" ? String(s.url).trim() : "";
            return nextUrl ? { ...im, url: nextUrl } : im;
          });
          hydratedAtLeastOnce = true;
          return true;
        }

        return false;
      } catch {
        return false;
      } finally {
        hydratingFromServer = false;
      }
    };

    const renderImages = () => {
      const imgs = report.images || [];
      if (el.attCount) el.attCount.textContent = `${imgs.length} image(s)`;
      if (el.imagePages) el.imagePages.innerHTML = "";
      try {
        document.body.classList.toggle("rc-noimages", !imgs.length);
      } catch {}
      if (!imgs.length) {
        // Recovery: si server sí tiene imágenes, rehidratar una vez y re-render.
        if (!hydratedAtLeastOnce) {
          hydrateImagesFromServer({ allowReplaceIfEmpty: true, allowMergeUrls: true }).then((changed) => {
            if (changed) {
              try { renderImages(); } catch {}
            }
          });
        }
        if (el.imagesEmpty) el.imagesEmpty.style.display = "block";
        return;
      }
      if (el.imagesEmpty) el.imagesEmpty.style.display = "none";

      // Si hay imágenes con path pero sin url/dataUrl, pedir urls firmadas y re-render.
      const needsUrl = imgs.some((im) => {
        const p = String(im?.path || "").trim();
        if (!p) return false;
        const hasUrl = typeof im?.url === "string" && String(im.url).trim();
        const hasData = typeof im?.dataUrl === "string" && String(im.dataUrl).startsWith("data:image/");
        return !hasUrl && !hasData;
      });
      if (needsUrl && !hydratedAtLeastOnce) {
        hydrateImagesFromServer({ allowReplaceIfEmpty: false, allowMergeUrls: true }).then((changed) => {
          if (changed) {
            try { renderImages(); } catch {}
          }
        });
      }

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
        img.src = im.dataUrl || im.url || "";
        img.alt = im.name || "image";
        img.addEventListener("error", async () => {
          // Recovery: si el signed URL expiró o no vino, rehidratar desde el servidor.
          try {
            const p = String(im.path || "").trim();
            if (!p) return;
            const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/report`, {
              method: "GET",
              credentials: "same-origin",
              cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));
            const payload = json?.payload || null;
            const list = Array.isArray(payload?.images) ? payload.images : [];
            const match = list.find((x) => String(x?.path || "").trim() === p);
            const nextUrl = match && typeof match.url === "string" ? match.url : "";
            if (nextUrl) {
              im.url = nextUrl;
              img.src = nextUrl;
              try {
                if (el.modalImg && modalImageId === im.id) el.modalImg.src = nextUrl;
              } catch {}
            }
          } catch {
            // ignore
          }
        });
        img.addEventListener("click", () => {
          modalImageId = im.id;
          if (el.modalTitle) el.modalTitle.textContent = im.name || "Imagen";
          if (el.modalImg) el.modalImg.src = im.dataUrl || im.url || "";
          el.modal?.classList?.add("show");
        });
        body.appendChild(img);

        page.appendChild(top);
        page.appendChild(body);
        el.imagePages?.appendChild(page);
      }
    };

    let importQueue = []; // staged images [{id,name,dataUrl,createdAt}]
    let pendingImportQueue = null;
    let importing = false;

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

    // Admin images modal (reordenar + portada)
    const closeAdminImages = () => {
      try {
        el.adminImagesModal?.classList?.remove("show");
      } catch {}
    };

    const moveReportImage = (from, to) => {
      try {
        const imgs = Array.isArray(report?.images) ? report.images.slice() : [];
        if (from < 0 || from >= imgs.length) return;
        if (to < 0 || to >= imgs.length) return;
        const [it] = imgs.splice(from, 1);
        imgs.splice(to, 0, it);
        report.images = imgs;
        scheduleSave();
        renderImages();
        renderAdminImages();
      } catch {}
    };

    const setAsCover = (idx) => {
      try {
        const imgs = Array.isArray(report?.images) ? report.images.slice() : [];
        if (idx < 0 || idx >= imgs.length) return;
        const [it] = imgs.splice(idx, 1);
        imgs.unshift(it);
        report.images = imgs;
        scheduleSave();
        renderImages();
        renderAdminImages();
      } catch {}
    };

    const renderAdminImages = () => {
      if (!el.adminImagesList) return;
      const imgs = Array.isArray(report?.images) ? report.images : [];
      el.adminImagesList.innerHTML = "";
      try {
        if (el.adminImagesStatus) {
          el.adminImagesStatus.textContent = imgs.length
            ? `Total: ${imgs.length} • #1 = Portada`
            : "No hay imágenes";
        }
      } catch {}
      if (!imgs.length) return;

      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
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
            moveReportImage(from, to);
          } catch {}
        });

        const th = document.createElement("div");
        th.className = "importThumb";
        const img = document.createElement("img");
        img.src = im.dataUrl || im.url || "";
        img.alt = im.name || "preview";
        th.appendChild(img);
        th.addEventListener("click", (ev) => {
          ev.stopPropagation();
          // Reusar modal principal
          try {
            modalImageId = im.id;
            if (el.modalTitle) el.modalTitle.textContent = im.name || "Imagen";
            if (el.modalImg) el.modalImg.src = im.dataUrl || im.url || "";
            el.modal?.classList?.add("show");
          } catch {}
        });

        const meta = document.createElement("div");
        meta.className = "importMeta";
        const nm = document.createElement("div");
        nm.className = "importName";
        nm.textContent = im.name || "Imagen";
        const hint = document.createElement("div");
        hint.className = "importHint";
        if (i === 0) {
          hint.innerHTML = `<span class="adminCoverBadge">Portada</span>`;
        } else {
          hint.textContent = `#${i + 1}`;
        }
        meta.appendChild(nm);
        meta.appendChild(hint);

        const actions = document.createElement("div");
        actions.className = "importActions";

        const up = document.createElement("button");
        up.type = "button";
        up.className = "miniBtnGhostSm";
        up.textContent = "↑";
        up.disabled = i === 0;
        up.addEventListener("click", () => moveReportImage(i, i - 1));

        const down = document.createElement("button");
        down.type = "button";
        down.className = "miniBtnGhostSm";
        down.textContent = "↓";
        down.disabled = i === imgs.length - 1;
        down.addEventListener("click", () => moveReportImage(i, i + 1));

        const cover = document.createElement("button");
        cover.type = "button";
        cover.className = "miniBtnGhostSm";
        cover.textContent = "Hacer portada";
        cover.disabled = i === 0;
        cover.addEventListener("click", () => setAsCover(i));

        actions.appendChild(up);
        actions.appendChild(down);
        actions.appendChild(cover);

        row.appendChild(th);
        row.appendChild(meta);
        row.appendChild(actions);
        el.adminImagesList.appendChild(row);
      }
    };

    const openAdminImages = () => {
      try {
        renderAdminImages();
        el.adminImagesModal?.classList?.add("show");
      } catch {}
    };

    const closeImport = () => {
      try { el.importModal?.classList?.remove("show"); } catch {}
      importQueue = [];
      if (el.importList) el.importList.innerHTML = "";
      try {
        importing = false;
        pendingImportQueue = null;
        if (el.importConfirm) el.importConfirm.disabled = false;
        if (el.importCancel) el.importCancel.disabled = false;
      } catch {}
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
        el.importStatus.textContent = importing
          ? `Subiendo ${total}…`
          : total
            ? `Listo: ${total} item(s) • La primera será la portada`
            : "Sin items";
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
        hint.textContent = i === 0 ? `#${i + 1} • Portada` : `#${i + 1}`;
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
        // indicador desactivado
      }
    };

    window.addEventListener("message", (ev) => {
      let data = ev?.data;
      if (!data || typeof data !== "object") return;
      try {
        if (data.type === "rc:uploadedImages") {
          if (data.noteId && String(data.noteId) !== String(noteId)) return;
          // Parent finished uploading. Replace staged base64 images with url/path refs.
          const ok = data.ok !== false;
          const imgs = Array.isArray(data.images) ? data.images : [];
          importing = false;
          const staged = Array.isArray(pendingImportQueue) ? pendingImportQueue.slice() : null;
          pendingImportQueue = null;
          try {
            if (el.importConfirm) el.importConfirm.disabled = false;
            if (el.importCancel) el.importCancel.disabled = false;
          } catch {}
          if (!ok || !imgs.length) {
            try {
              if (el.importStatus) el.importStatus.textContent = "No se pudieron subir las imágenes. Intenta de nuevo.";
            } catch {}
            return;
          }
          report.images = report.images || [];
          // Insertar primero respetando el orden elegido (ya viene ordenado)
          // UX: preview instantáneo usando dataUrl local mientras carga la URL firmada.
          // No se persiste (persist() lo filtra), solo es para que se vea "instantáneo".
          if (staged && staged.length) {
            for (let i = 0; i < imgs.length; i++) {
              try {
                if (staged[i] && typeof staged[i].dataUrl === "string") {
                  imgs[i].dataUrl = staged[i].dataUrl;
                }
              } catch {}
            }
          }
          report.images = [...imgs, ...(report.images || [])];
          persist(true);
          // CRÍTICO: avisar al parent para guardar en el servidor.
          // Sin esto, al cerrar/reabrir se pierden las imágenes/portada porque solo quedaron en localStorage del iframe.
          scheduleSave();
          renderImages();
          closeImport();
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
              // Include payload so parent can force-save reliably (no race with debounce).
              window.parent.postMessage({ type: "rc:flushed", noteId, requestId, payload: report }, "*");
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
    // (Sin modo offline/cola) no hacemos autosync ni mostramos estado.

    el.btnAddImages?.addEventListener?.("click", () => el.imgPicker?.click?.());
    el.btnManageImages?.addEventListener?.("click", () => openAdminImages());
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
      // En iframe: subir a Storage via parent (evita request gigante con base64).
      if (canPostToParent) {
        importing = true;
        pendingImportQueue = importQueue.slice();
        try {
          if (el.importStatus) el.importStatus.textContent = `Subiendo ${pendingImportQueue.length}…`;
        } catch {}
        try {
          if (el.importConfirm) el.importConfirm.disabled = true;
          if (el.importCancel) el.importCancel.disabled = true;
        } catch {}
        try {
          window.parent.postMessage({ type: "rc:uploadImages", noteId, images: pendingImportQueue }, "*");
        } catch {
          importing = false;
          pendingImportQueue = null;
          if (el.importConfirm) el.importConfirm.disabled = false;
          if (el.importCancel) el.importCancel.disabled = false;
          // fallback: guardar local base64
          report.images = report.images || [];
          report.images = [...importQueue, ...(report.images || [])];
          persist(true);
          renderImages();
          closeImport();
        }
        return;
      }

      // En pestaña directa (sin parent): guardar local base64 (best effort)
      report.images = report.images || [];
      report.images = [...importQueue, ...(report.images || [])];
      persist(true);
      renderImages();
      closeImport();
    });

    // Import preview modal controls
    el.importPreviewClose?.addEventListener?.("click", closeImportPreview);
    el.importPreviewModal?.addEventListener?.("click", (e) => {
      if (e.target === el.importPreviewModal) closeImportPreview();
    });

    // Admin images modal controls
    el.adminImagesClose?.addEventListener?.("click", closeAdminImages);
    el.adminImagesModal?.addEventListener?.("click", (e) => {
      if (e.target === el.adminImagesModal) closeAdminImages();
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
        // indicador desactivado
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

    // ── Date pickers ──────────────────────────────────────────────────────────
    initDatePickers();

  } catch {
    const root = document.getElementById("paper");
    if (root) {
      root.innerHTML =
        "<div style='padding:14px'><b>Error cargando el reporte.</b><div style='opacity:.7;margin-top:6px'>Intenta recargar la página.</div></div>";
    }
  }
})();

/* ── Custom date picker (pure JS, no dependencies) ─────────────────────── */
function initDatePickers() {
  const CAL_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const DATE_FIELDS = ["dateCashed","dateDeposit","dateReturned","dateFeePaid","dateCheckPaid","dateCompleted"];

  /* helpers */
  function parseDisplay(val) {
    const p = (val || "").trim().split("/");
    if (p.length !== 3) return null;
    const [m,d,y] = p.map(Number);
    if (!m||!d||!y) return null;
    return new Date(y < 100 ? 2000+y : y, m-1, d);
  }
  function fmtDisplay(date) {
    return String(date.getMonth()+1).padStart(2,"0")+"/"+String(date.getDate()).padStart(2,"0")+"/"+String(date.getFullYear()).slice(-2);
  }

  /* ── Build one shared calendar popup ── */
  const popup = document.createElement("div");
  popup.style.cssText = "position:fixed;z-index:99999;background:#fff;border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,.18),0 4px 16px rgba(0,0,0,.08);border:1px solid rgba(15,23,42,.09);padding:14px 12px 10px;width:284px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;display:none;user-select:none;";
  document.body.appendChild(popup);

  let _viewYear, _viewMonth, _selected, _targetInput;

  function closePopup() { popup.style.display = "none"; }

  function renderPopup() {
    const today = new Date();
    const first = new Date(_viewYear, _viewMonth, 1).getDay();
    const days  = new Date(_viewYear, _viewMonth+1, 0).getDate();

    let cells = "";
    for (let i=0; i<first; i++) cells += `<div></div>`;
    for (let d=1; d<=days; d++) {
      const isToday    = today.getFullYear()===_viewYear && today.getMonth()===_viewMonth && today.getDate()===d;
      const isSel      = _selected && _selected.getFullYear()===_viewYear && _selected.getMonth()===_viewMonth && _selected.getDate()===d;
      const bg         = isSel ? "#d11b2a" : "transparent";
      const color      = isSel ? "#fff"    : isToday ? "#d11b2a" : "#0f172a";
      const border     = isToday && !isSel ? "2px solid rgba(209,27,42,.45)" : "2px solid transparent";
      const fw         = isToday||isSel ? "900" : "700";
      cells += `<button data-day="${d}" style="width:100%;aspect-ratio:1/1;border:${border};background:${bg};color:${color};font-size:13px;font-weight:${fw};border-radius:10px;cursor:pointer;transition:background .1s;">${d}</button>`;
    }

    popup.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <button id="cp-prev" style="width:32px;height:32px;border:none;background:none;cursor:pointer;border-radius:10px;font-size:20px;line-height:1;color:#0f172a;">‹</button>
        <span style="font-size:14px;font-weight:800;color:#0f172a;">${MONTHS[_viewMonth]} ${_viewYear}</span>
        <button id="cp-next" style="width:32px;height:32px;border:none;background:none;cursor:pointer;border-radius:10px;font-size:20px;line-height:1;color:#0f172a;">›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:6px;">
        ${DAYS.map(d=>`<div style="text-align:center;font-size:10px;font-weight:900;color:rgba(15,23,42,.38);padding:3px 0;">${d}</div>`).join("")}
      </div>
      <div id="cp-days" style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;">${cells}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,.08);gap:6px;">
        <button id="cp-clear" style="font-size:12px;font-weight:700;color:rgba(15,23,42,.45);border:none;background:none;cursor:pointer;padding:4px 8px;border-radius:8px;">Clear</button>
        <button id="cp-today" style="font-size:12px;font-weight:700;color:#d11b2a;border:none;background:none;cursor:pointer;padding:4px 8px;border-radius:8px;">Today</button>
        <button id="cp-done" style="font-size:12px;font-weight:800;color:#fff;background:#0f172a;border:none;cursor:pointer;padding:5px 14px;border-radius:10px;margin-left:auto;">Listo</button>
      </div>`;

    /* hover effect on day cells */
    popup.querySelectorAll("[data-day]").forEach(btn => {
      btn.addEventListener("mouseenter", () => { if (btn.style.background !== "rgb(209, 27, 42)") btn.style.background="rgba(15,23,42,.07)"; });
      btn.addEventListener("mouseleave", () => { if (btn.style.background !== "rgb(209, 27, 42)") btn.style.background="transparent"; });
      btn.addEventListener("click", () => {
        const d = parseInt(btn.dataset.day);
        const date = new Date(_viewYear, _viewMonth, d);
        _targetInput.value = fmtDisplay(date);
        _targetInput.dispatchEvent(new Event("input", {bubbles:true}));
        closePopup();
      });
    });

    popup.querySelector("#cp-prev").addEventListener("click", () => { _viewMonth--; if(_viewMonth<0){_viewMonth=11;_viewYear--;} renderPopup(); });
    popup.querySelector("#cp-next").addEventListener("click", () => { _viewMonth++; if(_viewMonth>11){_viewMonth=0;_viewYear++;} renderPopup(); });
    popup.querySelector("#cp-today").addEventListener("click", () => {
      const t=new Date(); _targetInput.value=fmtDisplay(t);
      _targetInput.dispatchEvent(new Event("input",{bubbles:true})); closePopup();
    });
    popup.querySelector("#cp-clear").addEventListener("click", () => { _targetInput.value=""; _targetInput.dispatchEvent(new Event("input",{bubbles:true})); closePopup(); });
    popup.querySelector("#cp-done").addEventListener("click", () => closePopup());

    /* nav hover */
    ["cp-prev","cp-next"].forEach(id => {
      const b=popup.querySelector("#"+id);
      b.addEventListener("mouseenter",()=>b.style.background="rgba(15,23,42,.07)");
      b.addEventListener("mouseleave",()=>b.style.background="none");
    });
  }

  function openPopup(btn, input) {
    _targetInput = input;
    const d = parseDisplay(input.value) || new Date();
    _selected  = parseDisplay(input.value);
    _viewYear  = d.getFullYear();
    _viewMonth = d.getMonth();
    renderPopup();

    popup.style.display = "block";

    /* Position with fixed coords */
    const rect = btn.getBoundingClientRect();
    const pw = 284, ph = 340;
    let left = rect.left;
    let top  = rect.bottom + 6;
    if (left + pw > window.innerWidth - 8)  left = window.innerWidth - pw - 8;
    if (top  + ph > window.innerHeight - 8) top  = rect.top - ph - 6;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;
    popup.style.left = left + "px";
    popup.style.top  = top  + "px";
  }

  /* Close on outside click (use closest so SVG children inside calBtn are handled) */
  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && !e.target.closest(".calBtn")) closePopup();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key==="Escape") closePopup(); });

  /* ── Attach to each date field ── */
  DATE_FIELDS.forEach(fieldName => {
    const input = document.querySelector(`[data-field="${fieldName}"]`);
    if (!input || input.closest(".dateWrap")) return;

    const wrap = document.createElement("div");
    wrap.className = "dateWrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "calBtn"; btn.title = "Abrir calendario"; btn.innerHTML = CAL_ICON;
    wrap.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (popup.style.display !== "none" && _targetInput === input) { closePopup(); return; }
      openPopup(btn, input);
    });
  });
}

