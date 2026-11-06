export type Bucket = "pending" | "completed" | "trash";

export const APPREPORTE_V = "20261106-2";

export type Entry = {
  id: string;
  date: string; // yyyy-mm-dd
  agent: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function toEntryArray(values: Record<string, unknown> | null | undefined): Entry[] {
  const raw = (values as any)?._entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => ({
      id: typeof e?.id === "string" ? e.id : "",
      date: typeof e?.date === "string" ? e.date : "",
      agent: typeof e?.agent === "string" ? e.agent : "",
      note: typeof e?.note === "string" ? e.note : "",
      createdAt:
        typeof e?.createdAt === "string" ? e.createdAt : new Date().toISOString(),
      updatedAt:
        typeof e?.updatedAt === "string" ? e.updatedAt : new Date().toISOString(),
    }))
    .filter((e: Entry) => !!e.id && !!e.date);
}

export function sortEntriesDesc(entries: Entry[]) {
  return [...entries].sort((a, b) => {
    if ((a.date ?? "") !== (b.date ?? "")) return (b.date ?? "").localeCompare(a.date ?? "");
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

export function formatUsMmDdYy(iso: string) {
  const d = new Date((iso || isoToday()) + "T00:00:00");
  // US style: MM/DD/YY
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

export function parseMoneyToCents(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const num = Number(s.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

export function formatUsd(cents: number) {
  const n = cents / 100;
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function getTotalDueFromValues(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload;
  const raw = payload?.fields?.totalDue ?? payload?.fields?.total_due ?? payload?.totalDue;
  const cents = parseMoneyToCents(raw);
  if (cents === null) return { text: "$0.00", isSet: false };
  return { text: formatUsd(cents), isSet: true };
}

export function normText(v: unknown) {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim();
}

export function pickField(fields: any, keys: string[]) {
  for (const k of keys) {
    const v = fields?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

export function getTotalDueCentsFromValues(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload;
  const fields = payload?.fields ?? null;
  const raw = pickField(fields, ["totalDue", "total_due"]);
  const cents = parseMoneyToCents(raw);
  return cents === null ? 0 : Math.max(0, cents);
}

export function isBucket(v: unknown): v is Bucket {
  return v === "pending" || v === "completed" || v === "trash";
}

export function normalizePaymentToken(v: unknown) {
  const s = normText(v);
  if (!s) return "";
  if (s.toUpperCase() === "RELLENAR") return "";
  return s.toUpperCase();
}

export function statusFromPaymentMethod(
  raw: unknown,
  opts: { allowRedeposited?: boolean },
): { text: string; tone: "pending" | "paid" } {
  const token = normalizePaymentToken(raw);
  if (!token) return { text: "Pending", tone: "pending" };
  // Algunos usuarios usan "REDEPOSITED" también en Fee; lo soportamos.
  if (opts.allowRedeposited && token === "REDEPOSITED")
    return { text: "Redeposited", tone: "paid" };
  if (token === "PAID CASH") return { text: "Paid Cash", tone: "paid" };
  if (token === "PAID CHECK") return { text: "Paid Check", tone: "paid" };
  return { text: "Pending", tone: "pending" };
}

export function getLatestEntry(values: Record<string, unknown> | null | undefined): Entry | null {
  const arr = toEntryArray(values);
  if (!arr.length) return null;
  const sorted = sortEntriesDesc(arr);
  return sorted[0] ?? null;
}

export function getLatestEntryDateIso(values: Record<string, unknown> | null | undefined): string {
  const e = getLatestEntry(values);
  const d = (e?.date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function getLatestEntryDateTime(values: Record<string, unknown> | null | undefined): number {
  const iso = getLatestEntryDateIso(values);
  const t = iso ? Date.parse(iso + "T00:00:00") : 0;
  return Number.isFinite(t) ? t : 0;
}

export function getLatestAgent(values: Record<string, unknown> | null | undefined): string {
  const e = getLatestEntry(values);
  return normText(e?.agent);
}

export function getCheckPaymentStatusText(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload ?? null;
  const fields = payload?.fields ?? null;
  const raw = pickField(fields, ["checkPaymentMethod", "check_payment_method"]);
  return statusFromPaymentMethod(raw, { allowRedeposited: true }).text;
}

export function getPayText(values: Record<string, unknown> | null | undefined) {
  const payload = (values as any)?._report?.payload ?? null;
  const fields = payload?.fields ?? null;
  const maker = pickField(fields, ["makerPayor", "maker_payor"]);
  const payee = pickField(fields, ["payee"]);
  return `${normText(maker)} ${normText(payee)}`.trim();
}

export function fitTextToSingleLineInput(
  el: HTMLInputElement | null,
  opts?: { minPx?: number },
) {
  if (!el) return;
  const minPx = opts?.minPx ?? 12;

  // Reset any previous override so we start from CSS font-size (responsive).
  el.style.fontSize = "";

  const maxPx = Number.parseFloat(window.getComputedStyle(el).fontSize || "0") || 16;
  let lo = minPx;
  let hi = Math.max(minPx, Math.floor(maxPx));

  // If it already fits at max size, keep CSS default.
  if (el.scrollWidth <= el.clientWidth) return;

  // Binary search smallest font that fits.
  // We want the biggest size that fits, so we search and keep best.
  let best = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= el.clientWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = `${best}px`;
}
