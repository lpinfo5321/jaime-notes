// Ayudante local: recibe los PDF/CSV de la app y los guarda solo en OneDrive, dentro de la carpeta del anio.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { syncLog, LOG_DIR, LOG_FILE } from "./logsync.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PORT = 47321;
const BASE = path.join(os.homedir(), "OneDrive", "LA PRIMAVERA SUPERMARKET INC", "CHECK CASHING SERVICES", "RETURNED CHECKS", "NSF CHECKS PDF FILES");

const yearDir = (y) => path.join(BASE, String(y || new Date().getFullYear()));

/** PDF ya exportados (este año y el anterior): para avisar de duplicados. */
function listPdfs() {
  const now = new Date().getFullYear();
  const out = [];
  for (const y of [now, now - 1]) {
    let names = [];
    try {
      names = fs.readdirSync(yearDir(y));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.pdf$/i.test(name)) continue;
      try {
        const st = fs.statSync(path.join(yearDir(y), name));
        out.push({ name, year: y, mtime: Math.round(st.mtimeMs), size: st.size });
      } catch {}
    }
  }
  return out;
}

/** Quita los PDF viejos del mismo cheque ("2026/NOMBRE.pdf") para no dejar duplicados. */
function removeOld(list, keepName) {
  const now = new Date().getFullYear();
  let n = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const m = String(raw).match(/^(\d{4})\/(.+)$/);
    if (!m) continue;
    const name = path.basename(m[2]);
    if (!/\.pdf$/i.test(name)) continue;
    if (Number(m[1]) === now && name.toLowerCase() === String(keepName || "").toLowerCase()) continue;
    try {
      fs.unlinkSync(path.join(yearDir(m[1]), name));
      n += 1;
      console.log("Reemplazado (borrado)", name);
    } catch {}
  }
  return n;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Private-Network": "true",
};

http
  .createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") return send(204, {});
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/ping") return send(200, { ok: true, dir: path.join(BASE, String(new Date().getFullYear())) });
    if (url.pathname === "/list") return send(200, { ok: true, files: listPdfs() });
    if (url.pathname === "/open") {
      const y = /^\d{4}$/.test(url.searchParams.get("year") || "") ? url.searchParams.get("year") : String(new Date().getFullYear());
      const dir = yearDir(y);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
      const name = path.basename(url.searchParams.get("name") || "");
      const file = name ? path.join(dir, name) : "";
      if (file && fs.existsSync(file)) {
        execFile("explorer.exe", [`/select,"${file}"`], { windowsVerbatimArguments: true }, () => {});
      } else {
        execFile("explorer.exe", [`"${dir}"`], { windowsVerbatimArguments: true }, () => {});
      }
      return send(200, { ok: true, dir, file: file && fs.existsSync(file) ? file : "" });
    }
    if (url.pathname === "/log/status") return send(200, { ok: true, ...logPublic() });
    if (url.pathname === "/log/sync" && req.method === "POST") {
      logTick(url.searchParams.get("all") === "1")
        .then(() => send(200, { ok: true, ...logPublic() }))
        .catch((e) => send(500, { ok: false, error: String(e && e.message) }));
      return;
    }
    if (url.pathname === "/save" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "").replace(/[\\/:*?"<>|]/g, " ").trim();
      if (!name) return send(400, { ok: false, error: "sin nombre" });
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const dir = url.searchParams.get("dir") === "logs" ? LOG_DIR : path.join(BASE, String(new Date().getFullYear()));
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, name);
          fs.writeFileSync(file, Buffer.concat(chunks));
          const size = fs.statSync(file).size;
          const replaced = url.searchParams.get("dir") === "logs" ? 0 : removeOld(url.searchParams.getAll("replace"), name);
          send(200, { ok: true, file, size, replaced });
          pushIndex(true).catch(() => {});
        } catch (e) {
          send(500, { ok: false, error: String(e && e.message) });
        }
      });
      return;
    }
    if (url.pathname === "/save-as" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "reporte.pdf").replace(/[\\/:*?"<>|]/g, " ").trim() || "reporte.pdf";
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const dir = path.join(BASE, String(new Date().getFullYear()));
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch {}
        execFile(
          "powershell",
          ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "save-dialog.ps1")],
          { env: { ...process.env, RC_DIR: dir, RC_NAME: name }, windowsHide: false, maxBuffer: 1 << 20 },
          (err, stdout) => {
            if (err) return send(500, { ok: false, error: String(err.message) });
            const chosen = String(stdout || "").trim().split(/\r?\n/).pop();
            if (!chosen || chosen === "CANCEL") return send(200, { ok: false, cancelled: true });
            try {
              const buf = Buffer.concat(chunks);
              fs.writeFileSync(chosen, buf);
              send(200, { ok: true, file: chosen, size: fs.statSync(chosen).size });
            } catch (e) {
              send(500, { ok: false, error: String(e && e.message) });
            }
          },
        );
      });
      return;
    }
    send(404, { ok: false });
  })
  .listen(PORT, "127.0.0.1", () => console.log("Ayudante OneDrive activo en", PORT, "->", BASE));

/* El celular deja el PDF en la nube. Aquí se copia a la carpeta del año y se confirma. */
const OUTBOX = "nsf-outbox";
let outboxAdmin = null;

function outboxClient() {
  if (outboxAdmin) return outboxAdmin;
  try {
    const secrets = JSON.parse(fs.readFileSync(path.join(HERE, "secrets.local.json"), "utf8"));
    if (!secrets.url || !secrets.key) return null;
    outboxAdmin = createClient(secrets.url, secrets.key, { auth: { persistSession: false } });
    return outboxAdmin;
  } catch {
    return null;
  }
}

async function putMeta(admin, id, meta) {
  await admin.storage.from(OUTBOX).upload(`${id}/meta.json`, JSON.stringify(meta), {
    contentType: "application/json",
    upsert: true,
  });
}

async function drainOutbox() {
  const admin = outboxClient();
  if (!admin) return;
  const listed = await admin.storage.from(OUTBOX).list("", { limit: 100 });
  for (const item of listed.data || []) {
    if (item.id) continue;
    const id = item.name;
    const metaRes = await admin.storage.from(OUTBOX).download(`${id}/meta.json`);
    if (metaRes.error || !metaRes.data) continue;
    const meta = JSON.parse(await metaRes.data.text());
    if (meta.status === "uploading" && Date.now() - Number(meta.createdAt || 0) > 60 * 60 * 1000) {
      await admin.storage.from(OUTBOX).remove([`${id}/file`, `${id}/meta.json`]);
      continue;
    }
    if (meta.status === "saved" && Date.now() - Number(meta.createdAt || 0) > 2 * 60 * 60 * 1000) {
      await admin.storage.from(OUTBOX).remove([`${id}/meta.json`]);
      continue;
    }
    if (meta.status !== "pending") continue;
    const fileRes = await admin.storage.from(OUTBOX).download(`${id}/file`);
    if (fileRes.error || !fileRes.data) continue;
    const buf = Buffer.from(await fileRes.data.arrayBuffer());
    if (buf.length !== Number(meta.size)) {
      meta.status = "error";
      meta.error = "El archivo llegó incompleto y no se guardó.";
      await putMeta(admin, id, meta);
      continue;
    }
    try {
      const dir = path.join(BASE, String(meta.year || new Date().getFullYear()));
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, path.basename(String(meta.name || "reporte.pdf")));
      fs.writeFileSync(dest, buf);
      const written = fs.statSync(dest).size;
      if (written !== buf.length) throw new Error("escritura incompleta");
      removeOld(meta.replace, path.basename(dest));
      meta.status = "saved";
      meta.file = dest;
      meta.size = written;
      await admin.storage.from(OUTBOX).remove([`${id}/file`]);
      await putMeta(admin, id, meta);
      console.log("OneDrive <-", dest);
      pushIndex(true).catch(() => {});
    } catch (e) {
      meta.status = "error";
      meta.error = "No se pudo escribir en la carpeta de OneDrive.";
      await putMeta(admin, id, meta);
      console.log("Outbox error", e && e.message);
    }
  }
}

/* Lista de PDF exportados en la nube: así las otras computadoras y el celular saben si ya existe. */
let indexHash = "";
let indexAt = 0;
async function pushIndex(force = false) {
  const admin = outboxClient();
  if (!admin) return;
  const files = listPdfs();
  const h = JSON.stringify(files);
  if (!force && h === indexHash && Date.now() - indexAt < 10 * 60 * 1000) return;
  const up = await admin.storage
    .from(OUTBOX)
    .upload("_pdf/index.json", JSON.stringify({ at: Date.now(), files }), { contentType: "application/json", upsert: true });
  if (!up.error) {
    indexHash = h;
    indexAt = Date.now();
  }
}
setInterval(() => {
  pushIndex().catch(() => {});
}, 20000);
pushIndex().catch(() => {});

setInterval(() => {
  drainOutbox().catch((e) => console.log("Outbox", e && e.message));
}, 3000);
drainOutbox().catch(() => {});

/* Registro (Excel RETURNED CHECK LOG): cada cierto tiempo pasa los reportes al Excel y sube una copia para verla en la app. */
const LOG_STATE = path.join(HERE, "log-state.json");
let logBusy = false;
let logLast = { at: null, ok: null, locked: false, pending: 0, adoptable: 0, written: 0, errors: [], rowsInExcel: 0, file: LOG_FILE };
let logHash = "";
let logUploadedAt = 0;

function logPublic() {
  return { ...logLast, running: logBusy };
}

async function logTick(adoptAll = false) {
  if (logBusy) return;
  const admin = outboxClient();
  if (!admin) {
    logLast = { ...logLast, at: new Date().toISOString(), ok: false, errors: ["Falta secrets.local.json"] };
    return;
  }
  logBusy = true;
  try {
    const { data, error } = await admin.from("notes").select("id,title,tags,values,created_at,updated_at").limit(5000);
    if (error) throw new Error(error.message);
    // Solicitudes de "quitar del registro" que dejó la app (_log/del/*.json)
    const delFiles = [];
    const deletions = [];
    try {
      const listed = await admin.storage.from(OUTBOX).list("_log/del", { limit: 200 });
      for (const it of listed.data || []) {
        if (!it.id || !it.name.endsWith(".json")) continue;
        const p = `_log/del/${it.name}`;
        const dl = await admin.storage.from(OUTBOX).download(p);
        if (dl.error || !dl.data) continue;
        try {
          const j = JSON.parse(await dl.data.text());
          for (const r of j.rows || []) deletions.push({ r: Number(r.r), key: String(r.key || "") });
          delFiles.push(p);
        } catch {
          delFiles.push(p); // archivo dañado: se descarta
        }
      }
    } catch {}
    const res = await syncLog({ notes: data || [], stateFile: LOG_STATE, adoptAll, deletions });
    if (delFiles.length && res.deletionsDone) {
      await admin.storage.from(OUTBOX).remove(delFiles);
      if (res.deleted && res.deleted.length) console.log("Registro Excel - quitadas", res.deleted.length, "filas");
    }
    logLast = {
      at: new Date().toISOString(),
      ok: res.ok,
      locked: !!res.locked,
      pending: (res.pending || []).length,
      adoptable: res.adoptable || 0,
      written: (res.written || []).length,
      errors: res.errors || [],
      rowsInExcel: res.rowsInExcel || 0,
      file: res.file,
    };
    if (res.written && res.written.length) console.log("Registro Excel +", res.written.length, "filas");
    if (res.snapshot) {
      const body = JSON.stringify({ at: logLast.at, status: { locked: logLast.locked, pending: logLast.pending, adoptable: logLast.adoptable, errors: logLast.errors }, ...res.snapshot });
      const h = String(body.length) + ":" + JSON.stringify(res.snapshot.rows).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) + JSON.stringify(logLast.pending + "|" + logLast.locked);
      /* También se sube cada pocos minutos aunque no haya cambios: así la app sabe que la computadora sigue activa. */
      if (h !== logHash || Date.now() - logUploadedAt > 4 * 60 * 1000) {
        const up = await admin.storage.from(OUTBOX).upload("_log/snapshot.json", body, { contentType: "application/json", upsert: true });
        if (!up.error) {
          logHash = h;
          logUploadedAt = Date.now();
        }
      }
    }
  } catch (e) {
    logLast = { ...logLast, at: new Date().toISOString(), ok: false, errors: [String((e && e.message) || e)] };
    console.log("Registro", logLast.errors[0]);
  } finally {
    logBusy = false;
  }
}

setInterval(() => logTick().catch(() => {}), 45000);
setTimeout(() => logTick().catch(() => {}), 4000);
