"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "400px",
        background: "#ffffff",
        borderRadius: "24px",
        padding: "36px 32px 32px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.10), 0 2px 10px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Brand ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "28px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Return Checks"
          style={{
            width: "72px", height: "72px",
            borderRadius: "20px",
            objectFit: "contain",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            marginBottom: "14px",
          }}
        />
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>
          Return Checks
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#94a3b8" }}>
          Gestión de cheques retornados
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{
        display: "flex", gap: "4px",
        background: "#f1f5f9", borderRadius: "14px", padding: "4px",
        marginBottom: "22px",
      }}>
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); setInfo(null); }}
            style={{
              flex: 1, padding: "9px",
              borderRadius: "10px", border: "none",
              fontSize: "13px", fontWeight: 700,
              cursor: "pointer",
              transition: "all .15s",
              background: mode === m ? "white" : "transparent",
              color: mode === m ? "#0f172a" : "#64748b",
              boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {m === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      {/* ── Form ── */}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Email */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Email
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}>
              <Mail size={15} />
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              placeholder="tu@correo.com"
              style={{
                width: "100%", boxSizing: "border-box",
                paddingLeft: "38px", paddingRight: "14px",
                paddingTop: "11px", paddingBottom: "11px",
                borderRadius: "12px",
                border: "1.5px solid #e2e8f0",
                background: "#f8fafc",
                fontSize: "14px", color: "#0f172a",
                outline: "none", transition: "border .15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Contraseña
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}>
              <Lock size={15} />
            </span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPass ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              placeholder="••••••••"
              style={{
                width: "100%", boxSizing: "border-box",
                paddingLeft: "38px", paddingRight: "42px",
                paddingTop: "11px", paddingBottom: "11px",
                borderRadius: "12px",
                border: "1.5px solid #e2e8f0",
                background: "#f8fafc",
                fontSize: "14px", color: "#0f172a",
                outline: "none", transition: "border .15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              style={{
                position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", padding: "2px", lineHeight: 0,
              }}
              title={showPass ? "Ocultar" : "Mostrar"}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Info */}
        {info && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#16a34a" }}>
            {info}
          </div>
        )}

        {/* Resend confirmation */}
        {error?.toLowerCase().includes("email not confirmed") && (
          <button
            type="button"
            disabled={busy}
            onClick={resendConfirmation}
            style={{
              width: "100%", padding: "11px",
              borderRadius: "12px", border: "1.5px solid #e2e8f0",
              background: "white", fontSize: "13px", fontWeight: 600,
              color: "#475569", cursor: "pointer",
            }}
          >
            Reenviar correo de confirmación
          </button>
        )}

        {/* Submit */}
        <button
          disabled={busy}
          style={{
            marginTop: "4px", width: "100%",
            padding: "13px",
            borderRadius: "14px", border: "none",
            background: busy
              ? "#94a3b8"
              : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            color: "white",
            fontSize: "15px", fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
            boxShadow: busy ? "none" : "0 4px 20px rgba(15,23,42,0.35)",
            transition: "all .15s",
            letterSpacing: "0.2px",
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          {busy ? "Procesando…" : mode === "login" ? "Entrar →" : "Crear cuenta →"}
        </button>
      </form>

      {/* Footer */}
      <p style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
        Acceso seguro · Return Checks v1.0
      </p>
    </div>
  );
}
