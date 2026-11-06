/** Registro de cheques devueltos (copia del Excel RETURNED CHECK LOG). Las fechas vienen como YYYY-MM-DD. */
export type LogRow = {
  r: number;
  B?: string | null; // fecha cobrado
  C?: string | null; // fecha depósito
  D?: string | null; // fecha devolución
  E?: string | null; // beneficiario
  F?: string | number | null; // # cheque
  G?: string | null; // fecha del cheque
  H?: string | null; // compañía / emisor
  I?: string | null; // motivo
  M?: number | null; // monto
  N?: number | null; // comisión banco
  O?: number | null; // total
  P?: string | null; // fecha pago comisión
  Q?: string | null; // forma pago comisión
  R?: string | null; // fecha pago cheque
  S?: string | null; // forma pago cheque
  T?: string | null; // agente
  U?: string | null; // notas / estado
  n?: string; // id del reporte en la app (si todavía existe)
};

export type LogSnapshot = {
  at: string;
  status?: { locked?: boolean; pending?: number; adoptable?: number; errors?: string[] };
  rows: LogRow[];
  lastRow?: number;
};

export type LogState = "done" | "partial" | "open" | "loss";

export const STATE_LABEL: Record<LogState, string> = {
  done: "Completado",
  partial: "Pago parcial",
  open: "Pendiente",
  loss: "Pérdida",
};

export function rowState(r: LogRow): LogState {
  const q = String(r.Q ?? "").toUpperCase();
  const s = String(r.S ?? "").toUpperCase();
  if (q === "LOSS" || s === "LOSS") return "loss";
  const note = String(r.U ?? "").toUpperCase();
  if (note.includes("COMPLETED")) return "done";
  if (r.P || r.R || q || s) return "partial";
  return "open";
}

export function rowTotal(r: LogRow) {
  if (typeof r.O === "number") return r.O;
  return (Number(r.M) || 0) + (Number(r.N) || 0);
}

export function fmtMoney(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export function rowYear(r: LogRow) {
  const d = r.D || r.B || r.C || "";
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) && y > 2000 ? y : 0;
}

const HEAD = [
  ["DATE CASHED", "B", 14],
  ["DATE OF DEPOSIT", "C", 15],
  ["DATE OF RETURN", "D", 15],
  ["PAYEE", "E", 34],
  ["CHECK #", "F", 12],
  ["DATE ON CHECK", "G", 14],
  ["PAYOR", "H", 40],
  ["RETURN REASON", "I", 20],
  ["AMOUNT ON CHECK", "M", 16],
  ["BANK FEE", "N", 12],
  ["TOTAL AMOUNT (W/FEE)", "O", 18],
  ["DATE FEE PAID", "P", 14],
  ["FORM OF PYMT", "Q", 16],
  ["DATE CHK AMT PAID", "R", 16],
  ["FORM OF PYMT", "S", 16],
  ["AGENT", "T", 12],
  ["NOTES", "U", 18],
] as const;

const DATE_KEYS = new Set(["B", "C", "D", "G", "P", "R"]);

function isoToDate(iso?: string | null) {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/** Excel con el mismo formato que RETURNED CHECK LOG (título, encabezado, filtros y totales). */
export async function buildLogXlsx(rows: LogRow[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Return Checks";
  const ws = wb.addWorksheet("RETURNED ITEMS", { views: [{ state: "frozen", ySplit: 5, xSplit: 0 }] });
  ws.columns = HEAD.map(([, , w]) => ({ width: w }));

  ws.mergeCells(1, 1, 1, 8);
  ws.getCell("A1").value = "RETURNED CHECK LOG";
  ws.getCell("A1").font = { name: "Calibri", size: 24, bold: true, color: { argb: "FF1F3F36" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8E4DA" } };
  ws.mergeCells(2, 1, 2, 8);
  ws.getCell("A2").value = "LA PRIMAVERA SUPERMARKET INC";
  ws.getCell("A2").font = { name: "Calibri", size: 14, bold: true };
  ws.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8E4DA" } };
  ws.getCell("A3").value = `Generado ${new Date().toLocaleString("es")}`;
  ws.getCell("A3").font = { size: 9, italic: true, color: { argb: "FF71717A" } };
  ws.getRow(1).height = 34;
  ws.getRow(2).height = 22;

  const head = ws.getRow(5);
  HEAD.forEach(([t], i) => {
    const c = head.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D77A2" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF1F587A" } } };
  });
  head.height = 32;

  const sorted = [...rows].sort((a, b) => (a.D || "").localeCompare(b.D || "") || a.r - b.r);
  let n = 6;
  for (const r of sorted) {
    const row = ws.getRow(n);
    HEAD.forEach(([, key], i) => {
      const c = row.getCell(i + 1);
      const raw = (r as Record<string, unknown>)[key];
      if (key === "O") {
        c.value = { formula: `I${n}+J${n}`, result: rowTotal(r) };
      } else if (DATE_KEYS.has(key)) {
        const d = isoToDate(raw as string);
        if (d) c.value = d;
      } else if (raw !== null && raw !== undefined && raw !== "") c.value = raw as string | number;
      if (DATE_KEYS.has(key)) c.numFmt = "mm/dd/yyyy";
      if (key === "M" || key === "N" || key === "O") c.numFmt = '"$"#,##0.00';
      c.alignment = { vertical: "middle", horizontal: ["E", "H", "I"].includes(key) ? "left" : "center" };
      c.border = { bottom: { style: "hair", color: { argb: "FFD4D4D8" } } };
    });
    if (n % 2 === 1) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6FAF9" } }));
    n++;
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, n - 1), column: HEAD.length } };

  const total = ws.getRow(n + 1);
  total.getCell(8).value = "TOTAL";
  total.getCell(8).font = { bold: true };
  total.getCell(8).alignment = { horizontal: "right" };
  for (const [col, letter] of [[9, "I"], [10, "J"], [11, "K"]] as const) {
    const c = total.getCell(col);
    c.value = { formula: `SUM(${letter}6:${letter}${n - 1})`, result: sorted.reduce((s, r) => s + (col === 9 ? Number(r.M) || 0 : col === 10 ? Number(r.N) || 0 : rowTotal(r)), 0) };
    c.numFmt = '"$"#,##0.00';
    c.font = { bold: true };
  }

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
