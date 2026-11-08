// Sincroniza los reportes de la app con RETURNED CHECK LOG.xlsm (hoja RETURNED ITEMS).
// - Agrega cada reporte nuevo como una fila nueva (fecha, payee, cheque, payor, monto, fee…).
// - Cuando el reporte cambia (pagos, agente, estado) actualiza esa misma fila.
// - Nunca borra filas ni toca otras hojas, macros o comentarios. Hace respaldo diario antes de escribir.
// - Sube una copia del registro (snapshot) a la nube para verlo en la app, también desde el celular.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

export const LOG_DIR = path.join(os.homedir(), "OneDrive", "LA PRIMAVERA SUPERMARKET INC", "CHECK CASHING SERVICES", "RETURNED CHECKS", "NSF CK LOGS");
export const LOG_FILE = process.env.RC_LOG_FILE || path.join(LOG_DIR, "RETURNED CHECK LOG.xlsm");
const SHEET_PATH = "xl/worksheets/sheet1.xml"; // RETURNED ITEMS
const FIRST_ROW = 6;
const DATE_COLS = new Set(["B", "C", "D", "G", "P", "R"]);
const COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "M", "N", "O", "P", "Q", "R", "S", "T", "U"];
const NEW_ROW_STYLES = { A: 10, B: 5, C: 5, D: 5, E: 50, F: 10, H: 50, I: 5, M: 14, N: 44, O: 44, P: 5, Q: 5, R: 5, S: 5, T: 5, U: 5 };

/* ───────── utilidades ───────── */
const colNum = (c) => c.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const norm = (v) => String(v ?? "").trim();

function toSerial(raw) {
  const s = norm(raw);
  if (!s) return null;
  let y, m, d;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else {
    mt = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!mt) return null;
    m = Number(mt[1]);
    d = Number(mt[2]);
    y = Number(mt[3]);
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}
export function serialToIso(n) {
  const dt = new Date(Math.round((Number(n) - 25569) * 86400000));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function money(raw) {
  const n = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && String(raw ?? "").trim() !== "" ? n : null;
}
const keyCheck = (v) => {
  const s = norm(v).replace(/^#/, "");
  const digits = s.replace(/\D/g, "");
  return digits || s.toUpperCase();
};
const keyPayor = (v) => norm(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const rowKey = (check, payor) => `${keyCheck(check)}|${keyPayor(payor)}`;

function mapPayment(raw, extra) {
  const t = norm(raw).toUpperCase();
  if (!t || t === "RELLENAR") return "";
  let out = t;
  if (t === "PAID CASH") out = "CASH";
  else if (t === "PAID CHECK") out = "CHECK";
  else if (t === "REDEPOSITED") out = "REDEPOSIT";
  const num = norm(extra);
  if (out === "CHECK" && num) out = `CHECK #${num.replace(/^#/, "")}`;
  return out;
}

/** Fila del registro a partir de un reporte de la app. null = todavía no corresponde agregarlo. */
export function logRowFromNote(n) {
  const v = n?.values;
  if (!v) return null;
  if (Array.isArray(n.tags) && n.tags.includes("__draft")) return null;
  if (v._bucket === "trash") return null;
  const f = v?._report?.payload?.fields;
  if (!f) return null;
  const payor = norm(f.makerPayor) || norm(f.companyName) || norm(n.title);
  const check = norm(f.checkNumber).replace(/^#/, "");
  if (!payor || !check) return null;
  const feePaid = mapPayment(f.feePaymentMethod);
  const checkPaid = mapPayment(f.checkPaymentMethod, f.checkPaidNumber);
  const done = !!feePaid && !!checkPaid;
  const asNum = /^\d+$/.test(check) && check.length < 15 ? Number(check) : check;
  const amount = money(f.checkAmount);
  const fee = money(f.returnedFee);
  const cells = {
    B: toSerial(f.dateCashed),
    C: toSerial(f.dateDeposit),
    D: toSerial(f.dateReturned),
    E: norm(f.payee).toUpperCase() || null,
    F: asNum,
    H: payor.toUpperCase(),
    I: norm(f.rejectReason).toUpperCase() || null,
    M: amount,
    N: fee,
    P: toSerial(f.dateFeePaid),
    Q: feePaid || null,
    R: toSerial(f.dateCheckPaid),
    S: checkPaid || null,
    T: norm(f.agentCompleted).toUpperCase() || null,
    U: done ? "COMPLETED" : null,
  };
  return { key: rowKey(check, payor), cells, noteId: String(n.id), updatedAt: n.updated_at };
}

/* ───────── lectura de la hoja ───────── */
function parseShared(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1]));
    out.push(parts.join(""));
  }
  return out;
}

function splitRows(sheetXml) {
  const start = sheetXml.indexOf("<sheetData>") + "<sheetData>".length;
  const end = sheetXml.indexOf("</sheetData>");
  const rows = new Map();
  const re = /<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const body = sheetXml.slice(start, end);
  let m;
  while ((m = re.exec(body))) rows.set(Number(m[1]), { attrs: m[2], inner: m[3] || "" });
  return { head: sheetXml.slice(0, start), tail: sheetXml.slice(end), rows };
}

function parseCells(inner) {
  const cells = [];
  const re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(inner))) cells.push({ col: m[1], attrs: m[3], inner: m[4] || "" });
  return cells;
}

function cellValue(c, shared) {
  const t = /\bt="([A-Za-z]+)"/.exec(c.attrs)?.[1];
  if (t === "inlineStr") return unesc((c.inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] ?? "");
  const v = (c.inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  if (v == null) return null;
  if (t === "s") return shared[Number(v)] ?? "";
  if (t === "str") return unesc(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function readRow(rowObj, shared) {
  const out = {};
  for (const c of parseCells(rowObj.inner)) {
    const val = cellValue(c, shared);
    if (val !== null && val !== "") out[c.col] = val;
  }
  return out;
}

function cellXml(col, row, style, value) {
  const r = `${col}${row}`;
  const s = style != null ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return `<c r="${r}"${s}/>`;
  if (typeof value === "number") return `<c r="${r}"${s}><v>${value}</v></c>`;
  return `<c r="${r}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function buildRow(rowNum, attrs, cells) {
  cells.sort((a, b) => colNum(a.col) - colNum(b.col));
  const body = cells.map((c) => c.xml ?? (c.inner ? `<c r="${c.col}${rowNum}"${c.attrs}>${c.inner}</c>` : `<c r="${c.col}${rowNum}"${c.attrs}/>`)).join("");
  return `<row r="${rowNum}"${attrs}>${body}</row>`;
}

/** Escribe valores en una fila (existente o nueva). `only`: solo estas columnas. */
function writeRow(rowsMap, rowNum, values, mode, existing) {
  const cur = rowsMap.get(rowNum) ?? { attrs: ` spans="1:21" ht="18" customHeight="1"`, inner: "" };
  const cells = parseCells(cur.inner).map((c) => ({ ...c }));
  const byCol = new Map(cells.map((c) => [c.col, c]));
  let changed = false;
  for (const col of COLS) {
    if (col === "O") continue;
    const val = values[col];
    if (val === null || val === undefined || val === "") continue;
    const old = existing?.[col];
    const has = old !== undefined && old !== null && old !== "";
    if (mode === "fill" && has) continue;
    if (has && String(old).trim().toUpperCase() === String(val).trim().toUpperCase() && typeof old === typeof val) continue;
    if (has && typeof old === "number" && typeof val === "number" && Math.abs(old - val) < 1e-9) continue;
    const style = byCol.get(col)?.attrs.match(/s="(\d+)"/)?.[1] ?? NEW_ROW_STYLES[col];
    const xml = cellXml(col, rowNum, style, val);
    if (byCol.has(col)) byCol.get(col).xml = xml;
    else byCol.set(col, { col, attrs: "", inner: "", xml });
    changed = true;
  }
  // Total con fee (columna O): fórmula M+N con su valor ya calculado
  const mV = values.M ?? existing?.M;
  const nV = values.N ?? existing?.N;
  if (changed || !byCol.has("O")) {
    const total = (typeof mV === "number" ? mV : 0) + (typeof nV === "number" ? nV : 0);
    const o = byCol.get("O");
    if (o && /<f/.test(o.inner)) {
      const f = (o.inner.match(/<f[\s\S]*?(?:\/>|<\/f>)/) || [""])[0];
      o.xml = `<c r="O${rowNum}"${o.attrs}>${f}<v>${total}</v></c>`;
    } else if (changed) {
      byCol.set("O", { col: "O", attrs: "", inner: "", xml: `<c r="O${rowNum}" s="${o?.attrs.match(/s="(\d+)"/)?.[1] ?? 44}"><f>M${rowNum}+N${rowNum}</f><v>${total}</v></c>` });
    }
  }
  if (!rowsMap.has(rowNum)) {
    for (const [col, st] of Object.entries(NEW_ROW_STYLES)) if (!byCol.has(col)) byCol.set(col, { col, attrs: ` s="${st}"`, inner: "", xml: `<c r="${col}${rowNum}" s="${st}"/>` });
  }
  rowsMap.set(rowNum, { attrs: cur.attrs, inner: "", built: buildRow(rowNum, cur.attrs, [...byCol.values()]) });
  return changed;
}

function assemble(parts, rowsMap) {
  const nums = [...rowsMap.keys()].sort((a, b) => a - b);
  const body = nums.map((n) => rowsMap.get(n).built ?? `<row r="${n}"${rowsMap.get(n).attrs}>${rowsMap.get(n).inner}</row>`).join("");
  let xml = parts.head + body + parts.tail;
  const maxRow = nums[nums.length - 1];
  xml = xml.replace(/<dimension ref="A1:X(\d+)"\/>/, (m0, cur) => (maxRow > Number(cur) ? `<dimension ref="A1:X${maxRow}"/>` : m0));
  return xml;
}

/* ───────── ciclo de sincronización ───────── */
function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { baselineAt: null, owned: {}, hashes: {}, lastBackup: "" };
  }
}
function saveState(file, st) {
  fs.writeFileSync(file, JSON.stringify(st, null, 1));
}

function lastDataRow(rowsMap) {
  let last = FIRST_ROW - 1;
  for (const [n, r] of rowsMap) {
    if (n < FIRST_ROW) continue;
    const cells = parseCells(r.built ? "" : r.inner);
    for (const c of cells) {
      if (["B", "E", "F", "H"].includes(c.col) && /<v>|<is>/.test(c.inner)) {
        last = Math.max(last, n);
        break;
      }
    }
  }
  return last;
}

/** Vacía una fila que escribió la app (deja el formato; quita valores y fórmulas de las columnas de la app). */
const CLEAR_COLS = new Set([...COLS, "O"]);
function clearRow(rowsMap, rowNum) {
  const cur = rowsMap.get(rowNum);
  if (!cur) return;
  const cells = parseCells(cur.inner).map((c) => {
    if (!CLEAR_COLS.has(c.col)) return { ...c };
    const attrs = c.attrs.replace(/\s+t="[^"]*"/, "");
    return { ...c, attrs, inner: "", xml: `<c r="${c.col}${rowNum}"${attrs}/>` };
  });
  const inner = cells.map((c) => c.xml ?? (c.inner ? `<c r="${c.col}${rowNum}"${c.attrs}>${c.inner}</c>` : `<c r="${c.col}${rowNum}"${c.attrs}/>`)).join("");
  rowsMap.set(rowNum, { attrs: cur.attrs, inner });
}

/**
 * Quita de xl/calcChain.xml las fórmulas de las celdas que se vaciaron (si no, Excel pide "reparar").
 * En calcChain, una entrada sin i="" pertenece a la misma hoja que la anterior: se conserva eso.
 */
async function pruneCalcChain(zip, cellRefs) {
  const f = zip.file("xl/calcChain.xml");
  if (!f || !cellRefs.size) return;
  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const relId = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => /Target="(?:\/xl\/)?worksheets\/sheet1\.xml"/.test(t))?.match(/Id="([^"]+)"/)?.[1];
  const sheetTag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => relId && t.includes(`r:id="${relId}"`));
  const sheetId = sheetTag?.match(/sheetId="(\d+)"/)?.[1];
  if (!sheetId) return;
  const xml = await f.async("string");
  let cur = null;
  let carry = null; // i="" de una entrada quitada que hay que pasar a la siguiente
  let removed = 0;
  const out = xml.replace(/<c\b[^>]*\/>/g, (tag) => {
    const i = tag.match(/\bi="(\d+)"/)?.[1] ?? null;
    if (i) cur = i;
    const r = tag.match(/\br="([A-Z]+\d+)"/)?.[1];
    if (cur === sheetId && r && cellRefs.has(r)) {
      if (i) carry = i;
      removed++;
      return "";
    }
    if (carry && !i) {
      const fixed = tag.replace(/<c\b/, `<c i="${carry}"`);
      carry = null;
      return fixed;
    }
    carry = null;
    return tag;
  });
  if (removed) zip.file("xl/calcChain.xml", out);
}

export async function syncLog({ notes, stateFile, adoptAll = false, deletions = [] }) {
  const status = { ok: true, locked: false, file: LOG_FILE, written: [], pending: [], adoptable: 0, errors: [], rowsInExcel: 0, snapshot: null, deleted: [], deletionsDone: false };
  const state = loadState(stateFile);
  if (!state.baselineAt) {
    state.baselineAt = new Date().toISOString();
    saveState(stateFile, state);
  }
  if (!fs.existsSync(LOG_FILE)) {
    status.ok = false;
    status.errors.push("No encuentro RETURNED CHECK LOG.xlsm en OneDrive.");
    return status;
  }
  const lockFile = path.join(path.dirname(LOG_FILE), `~$${path.basename(LOG_FILE)}`);
  const excelOpen = fs.existsSync(lockFile);

  const buf = fs.readFileSync(LOG_FILE);
  const zip = await JSZip.loadAsync(buf);
  const sharedXml = await zip.file("xl/sharedStrings.xml").async("string");
  const sheetXml = await zip.file(SHEET_PATH).async("string");
  const shared = parseShared(sharedXml);
  const parts = splitRows(sheetXml);
  const rowsMap = parts.rows;

  // Filas que el usuario pidió quitar del registro. Solo filas que escribió la app (state.owned)
  // y solo si la fila sigue teniendo el mismo cheque y compañía. Nunca se mueven filas.
  const ownedKeys = new Set(Object.values(state.owned || {}));
  const toClear = [];
  if (deletions.length && !excelOpen) {
    for (const d of deletions) {
      if (!d || !d.key || !ownedKeys.has(d.key)) continue;
      let at = null;
      const rn = Number(d.r);
      if (rn >= FIRST_ROW && rowsMap.has(rn)) {
        const v = readRow(rowsMap.get(rn), shared);
        if (rowKey(v.F, v.H) === d.key) at = rn;
      }
      if (at == null) {
        for (const [n, r] of rowsMap) {
          if (n < FIRST_ROW) continue;
          const v = readRow(r, shared);
          if ((v.F != null || v.H != null) && rowKey(v.F, v.H) === d.key) { at = n; break; }
        }
      }
      if (at != null && !toClear.some((x) => x.rowNum === at)) toClear.push({ rowNum: at, key: d.key });
    }
    for (const c of toClear) clearRow(rowsMap, c.rowNum);
    if (!toClear.length) status.deletionsDone = true; // nada que quitar (ya no está o no es de la app)
  }
  if (deletions.length && excelOpen) status.locked = true;

  // Índice de lo que ya está en el Excel
  const index = new Map();
  const index2 = new Map();
  const snapshotRows = [];
  let lastRow = FIRST_ROW - 1;
  for (const [n, r] of rowsMap) {
    if (n < FIRST_ROW) continue;
    const vals = readRow(r, shared);
    if (vals.B == null && vals.E == null && vals.F == null && vals.H == null) continue;
    lastRow = Math.max(lastRow, n);
    index.set(rowKey(vals.F, vals.H), n);
    if (typeof vals.D === "number") index2.set(`${keyCheck(vals.F)}|${vals.D}`, n);
    const o = { r: n };
    for (const c of COLS) {
      if (vals[c] === undefined) continue;
      o[c] = DATE_COLS.has(c) && typeof vals[c] === "number" ? serialToIso(vals[c]) : vals[c];
    }
    if (ownedKeys.has(rowKey(vals.F, vals.H))) o.a = true; // fila escrita por la app (se puede quitar)
    snapshotRows.push(o);
  }
  status.rowsInExcel = snapshotRows.length;

  // Qué hay que escribir
  const baseline = new Date(state.baselineAt).getTime();
  const work = [];
  for (const n of notes) {
    const row = logRowFromNote(n);
    if (!row) continue;
    const hash = crypto.createHash("sha1").update(JSON.stringify(row.cells)).digest("hex");
    const at = index.get(row.key) ?? index2.get(`${row.key.split("|")[0]}|${row.cells.D}`) ?? null;
    const owned = state.owned[row.noteId] === row.key;
    const fresh = new Date(n.updated_at || n.created_at || 0).getTime() >= baseline;
    if (state.hashes[row.noteId] === hash && (at || !fresh) && !(adoptAll && !at)) continue;
    if (at == null && !fresh && !adoptAll) {
      status.adoptable += 1;
      continue;
    }
    if (at != null && !fresh && !owned && !adoptAll) continue;
    work.push({ row, at, owned, hash });
  }

  if (!work.length && !toClear.length) {
    status.snapshot = { rows: snapshotRows, lastRow };
    return status;
  }
  if (excelOpen) {
    status.locked = true;
    status.pending = work.map((w) => ({ id: w.row.noteId, reason: "Excel abierto" }));
    status.snapshot = { rows: snapshotRows, lastRow };
    return status;
  }

  // Aplicar cambios en memoria
  let next = lastRow + 1;
  const applied = [];
  for (const w of work) {
    if (w.at != null) {
      const existing = readRow(rowsMap.get(w.at), shared);
      const mode = w.owned ? "full" : "fill";
      const changed = writeRow(rowsMap, w.at, w.row.cells, mode, existing);
      if (changed) applied.push({ ...w, rowNum: w.at, created: false });
      else state.hashes[w.row.noteId] = w.hash;
    } else {
      const n = next++;
      writeRow(rowsMap, n, w.row.cells, "full", null);
      index.set(w.row.key, n);
      applied.push({ ...w, rowNum: n, created: true });
    }
  }

  if (!applied.length && !toClear.length) {
    saveState(stateFile, state);
    status.snapshot = { rows: snapshotRows, lastRow };
    return status;
  }
  const newSheet = assemble(parts, rowsMap);
  zip.file(SHEET_PATH, newSheet);
  if (toClear.length) await pruneCalcChain(zip, new Set(toClear.map((c) => `O${c.rowNum}`)));
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  // Verificación: se vuelve a leer lo escrito antes de reemplazar el archivo
  const check = await JSZip.loadAsync(out);
  const checkSheet = await check.file(SHEET_PATH).async("string");
  const checkRows = splitRows(checkSheet).rows;
  for (const a of applied) {
    const got = readRow(checkRows.get(a.rowNum), shared);
    for (const col of COLS) {
      if (col === "O") continue;
      const want = a.row.cells[col];
      if (want === null || want === undefined || want === "") continue;
      const g = got[col];
      if (a.owned || a.created) {
        const same = typeof want === "number" ? Math.abs(Number(g) - want) < 1e-9 : String(g ?? "").trim().toUpperCase() === String(want).trim().toUpperCase();
        if (!same) throw new Error(`Verificación falló en fila ${a.rowNum} columna ${col}`);
      }
    }
  }
  for (const c of toClear) {
    const got = readRow(checkRows.get(c.rowNum) ?? { inner: "" }, shared);
    for (const col of CLEAR_COLS) if (got[col] !== undefined) throw new Error(`Verificación falló al quitar la fila ${c.rowNum}`);
  }

  // Respaldo del día y reemplazo (antes de quitar filas, siempre un respaldo nuevo)
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastBackup !== today || toClear.length) {
    const bdir = path.join(path.dirname(LOG_FILE), "BACKUP AUTOMATICO");
    fs.mkdirSync(bdir, { recursive: true });
    const stamp = toClear.length ? ` antes de quitar ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}` : "";
    fs.copyFileSync(LOG_FILE, path.join(bdir, `RETURNED CHECK LOG ${today}${stamp}.xlsm`));
    state.lastBackup = today;
  }
  const tmp = `${LOG_FILE}.rc-tmp`;
  fs.writeFileSync(tmp, out);
  try {
    fs.renameSync(tmp, LOG_FILE);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    status.locked = true;
    status.pending = work.map((w) => ({ id: w.row.noteId, reason: "Excel abierto o OneDrive ocupado" }));
    status.snapshot = { rows: snapshotRows, lastRow };
    return status;
  }

  if (toClear.length) {
    const gone = new Set(toClear.map((c) => c.key));
    for (const [id, k] of Object.entries(state.owned)) if (gone.has(k)) { delete state.owned[id]; delete state.hashes[id]; }
    status.deleted = toClear.map((c) => ({ row: c.rowNum, key: c.key }));
    status.deletionsDone = true;
  }
  for (const a of applied) {
    state.hashes[a.row.noteId] = a.hash;
    if (a.created || a.owned) state.owned[a.row.noteId] = a.row.key;
    status.written.push({ id: a.row.noteId, row: a.rowNum, created: a.created, key: a.row.key });
    // refrescar el snapshot con la fila escrita
    const vals = readRow(checkRows.get(a.rowNum), shared);
    const o = { r: a.rowNum };
    for (const c of COLS) if (vals[c] !== undefined) o[c] = DATE_COLS.has(c) && typeof vals[c] === "number" ? serialToIso(vals[c]) : vals[c];
    if (a.created || a.owned) o.a = true;
    const i = snapshotRows.findIndex((x) => x.r === a.rowNum);
    if (i >= 0) snapshotRows[i] = o;
    else snapshotRows.push(o);
  }
  saveState(stateFile, state);
  status.snapshot = { rows: snapshotRows.sort((x, y) => x.r - y.r), lastRow: Math.max(lastRow, next - 1) };
  return status;
}
