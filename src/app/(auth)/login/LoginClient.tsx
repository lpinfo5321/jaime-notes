"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";

export default function LoginClient({ nextUrl }: { nextUrl: string }) {
  const [mode,     setMode]     = useState<"login" | "signup">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [info,     setInfo]     = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
      }
      window.location.href = nextUrl;
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Error al iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) { setError("Escribe tu email para reenviar la confirmación."); return; }
    setBusy(true); setError(null); setInfo(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (err) throw err;
      setInfo("Listo. Te envié un correo para confirmar tu email. Revisa Inbox/Spam y abre el link, luego vuelve e intenta entrar.");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "No se pudo reenviar el correo");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-zinc-200 bg-white/80 py-3 pl-11 text-[15px] font-medium text-zinc-900 " +
    "placeholder:text-zinc-400 outline-none transition " +
    "focus:border-lime-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(132,204,22,0.18)] " +
    "dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-zinc-500 " +
    "dark:focus:border-lime-400 dark:focus:bg-white/[0.06]";

  const labelCls =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

  return (
    <div className="animate-slide-up grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0c111b]/80 dark:shadow-[0_30px_80px_rgba(0,0,0,0.6)] lg:grid-cols-[1.05fr_1fr]">

      {/* ═════════ Panel de marca (solo escritorio) ═════════ */}
      <aside className="relative hidden overflow-hidden bg-[#0a0f1a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Fondo */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(520px 380px at 0% 0%, rgba(163,230,53,0.30), transparent 62%)," +
              "radial-gradient(520px 420px at 100% 100%, rgba(56,189,248,0.22), transparent 62%)," +
              "radial-gradient(400px 300px at 80% 10%, rgba(99,102,241,0.22), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 30%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 30%, black, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Return Checks"
            className="h-11 w-11 rounded-2xl bg-white/90 object-contain p-1 shadow-lg"
          />
          <span className="text-lg font-extrabold tracking-tight">Return Checks</span>
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-lime-200 backdrop-blur">
            <Sparkles className="h-3 w-3" /> Gestión inteligente
          </span>
          <h2 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight">
            Controla tus cheques
            <br />
            <span className="text-brand-gradient">retornados</span> sin esfuerzo.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-slate-300">
            Reportes, notas por compañía, contactos y documentos en un solo lugar,
            sincronizados en todos tus dispositivos.
          </p>

          <ul className="mt-7 space-y-3 text-sm">
            {[
              "Dashboard por compañía con total adeudado",
              "Reportes con fotos y exportación a PDF",
              "Sincronización segura en la nube",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-slate-200">
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-lime-300" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Mini tarjeta decorativa */}
        <div className="animate-float-slow relative ml-auto w-64 rounded-3xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
              Total Due
            </span>
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              ✓ All Paid
            </span>
          </div>
          <div className="mt-2 text-3xl font-black tabular-nums tracking-tight">$12,480</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-4/5 rounded-full" style={{ background: "var(--brand-gradient)" }} />
          </div>
        </div>
      </aside>

      {/* ═════════ Formulario ═════════ */}
      <section className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12">
        {/* Marca (móvil) */}
        <div className="mb-7 flex flex-col items-center text-center lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Return Checks"
            className="h-16 w-16 rounded-[22px] bg-white object-contain p-1 shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
          />
          <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Return Checks
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Gestión de cheques retornados</p>
        </div>

        <div className="hidden lg:block">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
            {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "login"
              ? "Ingresa tus credenciales para continuar."
              : "Regístrate para empezar a gestionar tus cheques."}
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-white/[0.06]">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setInfo(null); }}
              className={
                "rounded-xl py-2.5 text-[13px] font-bold transition-all " +
                (mode === m
                  ? "bg-white text-zinc-900 shadow-[0_2px_8px_rgba(15,23,42,0.10)] dark:bg-white/10 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200")
              }
            >
              {m === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {/* Email */}
          <div>
            <label className={labelCls}>Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-zinc-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                placeholder="tu@correo.com"
                className={inputCls + " pr-4"}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={labelCls}>Contraseña</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-zinc-400" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                placeholder="••••••••"
                className={inputCls + " pr-12"}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                title={showPass ? "Ocultar" : "Mostrar"}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="animate-fade-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Info */}
          {info && (
            <div className="animate-fade-in rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              {info}
            </div>
          )}

          {/* Resend confirmation */}
          {error?.toLowerCase().includes("email not confirmed") && (
            <button
              type="button"
              disabled={busy}
              onClick={resendConfirmation}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              Reenviar correo de confirmación
            </button>
          )}

          {/* Submit */}
          <button
            disabled={busy}
            className="btn-ink mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-extrabold tracking-tight disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
              </>
            ) : (
              <>
                {mode === "login" ? "Entrar" : "Crear cuenta"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-zinc-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Acceso seguro · Return Checks v1.0
        </p>
      </section>
    </div>
  );
}
