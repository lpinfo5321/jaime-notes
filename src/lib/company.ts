/** Utilidades para tratar nombres de compañía y teléfonos de forma coherente en toda la app. */

/** Forma "canónica" para comparar: sin mayúsculas, acentos, puntuación sobrante ni espacios dobles. */
export function normCompany(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:'"`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Solo dígitos de un teléfono (para buscar "7710000" aunque esté guardado como "(771) 000-0000"). */
export function digitsOnly(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D+/g, "");
}

/** Distancia de edición simple (para detectar nombres casi iguales: "Endura Construction" vs "Endura Construcion"). */
function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

export type CompanyMatch = { name: string; kind: "exact" | "similar" };

/**
 * Compara un nombre escrito contra la lista de compañías existentes.
 * - exact: es la misma compañía (ignorando mayúsculas, acentos y puntuación)
 * - similar: uno contiene al otro, o difieren por una o dos letras
 */
export function matchCompanies(input: string, existing: string[]): CompanyMatch[] {
  const n = normCompany(input);
  if (!n) return [];
  const out: CompanyMatch[] = [];
  for (const name of existing) {
    const e = normCompany(name);
    if (!e) continue;
    if (e === n) {
      out.push({ name, kind: "exact" });
    } else if (n.length >= 3 && (e.includes(n) || n.includes(e))) {
      out.push({ name, kind: "similar" });
    } else if (n.length >= 6 && editDistance(n, e, 2) <= 2) {
      out.push({ name, kind: "similar" });
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "exact" ? -1 : 1));
  return out.slice(0, 6);
}
