"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Mail, Building2, Search, Plus, Pencil, Trash2,
  X, ChevronLeft, User, UserPlus, Users,
} from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */
interface Contact {
  id: string;
  name: string;
  phones: string[];
  email?: string;
  company?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

type Mode = "list" | "new" | "edit";

const EMPTY_FORM = { name: "", phones: [""], email: "", company: "", notes: "" };

/* ─────────────────────────── avatar color ──────────────────── */
const AVATAR_COLORS = [
  "from-rose-500 to-pink-600",
  "from-orange-400 to-amber-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-fuchsia-500 to-pink-500",
  "from-cyan-500 to-sky-600",
  "from-lime-500 to-green-600",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─────────────────────────── ContactCard ───────────────────── */
function ContactCard({
  contact,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onEdit: (c: Contact) => void;
  onDelete: (c: Contact) => void;
}) {
  const color = avatarColor(contact.name);
  const phones = contact.phones.filter(Boolean);
  const firstPhone = phones[0];

  return (
    <div className="animate-card-in group relative flex overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/50 dark:bg-zinc-900
      /* mobile: horizontal row */
      flex-row items-center gap-3 p-3
      /* desktop: vertical card */
      md:flex-col md:items-stretch md:gap-0 md:p-0
    ">

      {/* ── Desktop: avatar banner ── */}
      <div className={`hidden md:flex h-32 items-center justify-center bg-gradient-to-br ${color} bg-opacity-10 relative`}>
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-xl font-bold text-white shadow-lg`}>
          {initials(contact.name)}
        </div>
        {/* desktop action buttons (top-right hover) */}
        <div className="absolute right-2 top-2 hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
          <button onClick={() => onEdit(contact)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-zinc-500 hover:bg-white hover:text-zinc-800 shadow-sm" title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(contact)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-zinc-500 hover:bg-red-50 hover:text-red-600 shadow-sm" title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Mobile: avatar circle (left) ── */}
      <div className={`md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-sm font-bold text-white shadow-sm`}>
        {initials(contact.name)}
      </div>

      {/* ── Info ── */}
      <div className="min-w-0 flex-1 md:px-3 md:py-2.5">
        <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50 md:text-center md:text-sm">
          {contact.name}
        </p>
        {contact.company && (
          <p className="flex items-center gap-1 truncate text-xs text-zinc-500 dark:text-zinc-400 md:justify-center">
            <Building2 className="h-3 w-3 shrink-0" />
            {contact.company}
          </p>
        )}
        {/* desktop: phone preview */}
        {firstPhone && (
          <p className="mt-1 hidden truncate text-center text-xs text-zinc-400 md:block">
            {firstPhone}
          </p>
        )}
      </div>

      {/* ── Mobile: inline actions ── */}
      <div className="flex shrink-0 items-center gap-1 md:hidden">
        {firstPhone && (
          <a href={`tel:${firstPhone.replace(/\s/g, "")}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
            title="Llamar">
            <Phone className="h-4 w-4" />
          </a>
        )}
        <button onClick={() => onEdit(contact)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(contact)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Desktop: action row at bottom ── */}
      <div className="hidden border-t border-zinc-100 dark:border-zinc-800/60 md:flex items-center gap-1 px-2 py-1.5">
        {firstPhone && (
          <a href={`tel:${firstPhone.replace(/\s/g, "")}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800"
            title={firstPhone}>
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800"
            title={contact.email}>
            <Mail className="h-3.5 w-3.5" />
          </a>
        )}
        <div className="flex-1" />
        <button onClick={() => onEdit(contact)} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(contact)} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── ContactModal ──────────────────── */
function ContactModal({
  mode,
  initial,
  onSave,
  onClose,
  busy,
}: {
  mode: "new" | "edit";
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(initial);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addPhone() { setForm((f) => ({ ...f, phones: [...f.phones, ""] })); }
  function setPhone(i: number, v: string) {
    setForm((f) => { const p = [...f.phones]; p[i] = v; return { ...f, phones: p }; });
  }
  function removePhone(i: number) {
    setForm((f) => ({ ...f, phones: f.phones.filter((_, idx) => idx !== i) }));
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="animate-slide-up relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-950 sm:animate-scale-in sm:rounded-3xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {mode === "new" ? "Nuevo contacto" : "Editar contacto"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {/* name */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Nombre *
              </label>
              <input
                ref={firstRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-blue-400 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-blue-500"
              />
            </div>

            {/* company */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Compañía
              </label>
              <input
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Empresa u organización"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-blue-400 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-blue-500"
              />
            </div>

            {/* phones */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Teléfonos
                </label>
                <button
                  type="button"
                  onClick={addPhone}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                >
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.phones.map((ph, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={ph}
                      onChange={(e) => setPhone(i, e.target.value)}
                      placeholder="(555) 000-0000"
                      type="tel"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-blue-400 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-blue-500"
                    />
                    {form.phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePhone(i)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* email */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Email
              </label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
                type="email"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-blue-400 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-blue-500"
              />
            </div>

            {/* notes */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Notas
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notas adicionales..."
                rows={3}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-blue-400 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={busy || !form.name.trim()}
            className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {busy ? "Guardando…" : mode === "new" ? "Agregar" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── DeleteModal ───────────────────── */
function DeleteModal({ name, onConfirm, onCancel, busy }: {
  name: string; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="animate-scale-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-950">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/40">
          <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Eliminar contacto
        </h3>
        <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Eliminar a <strong className="text-zinc-700 dark:text-zinc-200">{name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Main View ─────────────────────── */
export default function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /* fetch */
  const load = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      const json = await res.json();
      setContacts(json.contacts ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* debounced search */
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  /* filtered locally too for instant feedback */
  const visible = useMemo(() => {
    if (!q.trim()) return contacts;
    const lq = q.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(lq) ||
        (c.company ?? "").toLowerCase().includes(lq) ||
        (c.email ?? "").toLowerCase().includes(lq) ||
        c.phones.some((p) => p.includes(lq)),
    );
  }, [contacts, q]);

  /* grouped by first letter */
  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of visible) {
      const letter = c.name[0]?.toUpperCase() ?? "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  /* save */
  async function handleSave(form: typeof EMPTY_FORM) {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const phones = form.phones.filter(Boolean);
      if (mode === "new") {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, phones }),
        });
        const json = await res.json();
        if (json.id) {
          setContacts((prev) =>
            [...prev, { id: json.id, ...form, phones, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } else if (editTarget) {
        await fetch(`/api/contacts/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, phones }),
        });
        setContacts((prev) =>
          prev
            .map((c) => (c.id === editTarget.id ? { ...c, ...form, phones } : c))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      setMode("list");
      setEditTarget(null);
    } catch {}
    setBusy(false);
  }

  /* delete */
  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await fetch(`/api/contacts/${deleteTarget.id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {}
    setBusy(false);
  }

  const formInitial = editTarget
    ? { name: editTarget.name, phones: editTarget.phones.length ? editTarget.phones : [""], email: editTarget.email ?? "", company: editTarget.company ?? "", notes: editTarget.notes ?? "" }
    : EMPTY_FORM;

  return (
    <div className="min-h-[60vh] pb-20">
      {/* ── Top bar ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Contactos</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {contacts.length} {contacts.length === 1 ? "contacto" : "contactos"}
            </p>
          </div>
        </div>

        <button
          onClick={() => { setEditTarget(null); setMode("new"); }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 sm:w-auto"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo contacto
        </button>
      </div>

      {/* ── Search ── */}
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/50">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, compañía, teléfono o email…"
          className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400"
        />
        {q && (
          <button onClick={() => setQ("")} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
          <span className="text-sm">Cargando contactos…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 dark:bg-zinc-800">
            <User className="h-8 w-8 text-zinc-400" />
          </div>
          <div>
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">
              {q ? "No se encontraron contactos" : "Aún no hay contactos"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {q ? "Intenta con otro término de búsqueda" : "Agrega tu primer contacto con el botón de arriba"}
            </p>
          </div>
          {!q && (
            <button
              onClick={() => { setEditTarget(null); setMode("new"); }}
              className="flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
            >
              <UserPlus className="h-4 w-4" /> Agregar contacto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Desktop: flat grid, no grouping ── */}
          <div className="hidden md:grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visible.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                onEdit={(c) => { setEditTarget(c); setMode("edit"); }}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>

          {/* ── Mobile: grouped list ── */}
          <div className="flex flex-col gap-6 md:hidden">
            {grouped.map(([letter, items]) => (
              <section key={letter}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {letter}
                  </span>
                  <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((c) => (
                    <ContactCard
                      key={c.id}
                      contact={c}
                      onEdit={(c) => { setEditTarget(c); setMode("edit"); }}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {(mode === "new" || mode === "edit") && (
        <ContactModal
          mode={mode}
          initial={formInitial}
          onSave={handleSave}
          onClose={() => { setMode("list"); setEditTarget(null); }}
          busy={busy}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
