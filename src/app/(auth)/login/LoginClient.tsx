"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginClient({ nextUrl }: { nextUrl: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
        });
        if (err) throw err;
      }

      window.location.href = nextUrl;
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "Error al iniciar sesión";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setError("Escribe tu email para reenviar la confirmación.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });
      if (err) throw err;
      setInfo(
        "Listo. Te envié un correo para confirmar tu email. Revisa Inbox/Spam y abre el link, luego vuelve e intenta entrar.",
      );
    } catch (e2) {
      const msg =
        e2 instanceof Error ? e2.message : "No se pudo reenviar el correo";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Jaime Notes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Notas/expedientes con plantillas y adjuntos, sincronizado en la nube.
        </p>
      </div>

      <div className="mb-5 flex gap-2 rounded-xl bg-zinc-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={[
            "flex-1 rounded-lg px-3 py-2 font-medium transition",
            mode === "login" ? "bg-white shadow-sm" : "text-zinc-600",
          ].join(" ")}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={[
            "flex-1 rounded-lg px-3 py-2 font-medium transition",
            mode === "signup" ? "bg-white shadow-sm" : "text-zinc-600",
          ].join(" ")}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none ring-zinc-300 focus:ring-2"
            placeholder="tu@correo.com"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Contraseña</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none ring-zinc-300 focus:ring-2"
            placeholder="••••••••"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {info}
          </div>
        ) : null}

        {error?.toLowerCase().includes("email not confirmed") ? (
          <button
            type="button"
            disabled={busy}
            onClick={resendConfirmation}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Reenviar correo de confirmación
          </button>
        ) : null}

        <button
          disabled={busy}
          className="mt-2 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-4 text-xs text-zinc-500">
        Tip: en Supabase puedes crear solo tu cuenta admin y desactivar registros
        públicos si lo prefieres.
      </p>
    </div>
  );
}

