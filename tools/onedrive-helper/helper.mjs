// Ayudante local: recibe los PDF/CSV de la app y los guarda solo en OneDrive, dentro de la carpeta del anio.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 47321;
const BASE = path.join(os.homedir(), "OneDrive", "LA PRIMAVERA SUPERMARKET INC", "CHECK CASHING SERVICES", "RETURNED CHECKS", "NSF CHECKS PDF FILES");

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
    if (url.pathname === "/save" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "").replace(/[\\/:*?"<>|]/g, " ").trim();
      if (!name) return send(400, { ok: false, error: "sin nombre" });
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const dir = path.join(BASE, String(new Date().getFullYear()));
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, name);
          fs.writeFileSync(file, Buffer.concat(chunks));
          send(200, { ok: true, file });
        } catch (e) {
          send(500, { ok: false, error: String(e && e.message) });
        }
      });
      return;
    }
    send(404, { ok: false });
  })
  .listen(PORT, "127.0.0.1", () => console.log("Ayudante OneDrive activo en", PORT, "->", BASE));
