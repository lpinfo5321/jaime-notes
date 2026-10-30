import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normCompany } from "@/lib/company";

/**
 * Directorio de compañías: une los reportes (notes.title) con los contactos (contacts.company)
 * para que toda la app use los mismos nombres.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notesRes, contactsRes] = await Promise.all([
    supabase.from("notes").select("title").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("contacts").select("id,name,phones,email,company").limit(1000),
  ]);
  if (notesRes.error) return NextResponse.json({ error: notesRes.error.message }, { status: 400 });

  type Entry = {
    name: string;
    reports: number;
    contacts: { id: string; name: string; phones: string[]; email: string | null }[];
  };
  const map = new Map<string, Entry>();

  for (const n of (notesRes.data ?? []) as any[]) {
    const raw = String(n.title ?? "").trim();
    if (!raw) continue;
    // Solo reportes activos cuentan para "ya existe" (los de la papelera igual se muestran, por coherencia)
    const key = normCompany(raw);
    const e = map.get(key) ?? { name: raw, reports: 0, contacts: [] };
    e.reports += 1;
    map.set(key, e);
  }

  for (const c of (contactsRes.data ?? []) as any[]) {
    const raw = String(c.company ?? "").trim();
    if (!raw) continue;
    const key = normCompany(raw);
    const e = map.get(key) ?? { name: raw, reports: 0, contacts: [] };
    e.contacts.push({
      id: String(c.id),
      name: String(c.name ?? ""),
      phones: Array.isArray(c.phones) ? c.phones.filter(Boolean) : [],
      email: c.email ?? null,
    });
    map.set(key, e);
  }

  const companies = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ companies });
}
