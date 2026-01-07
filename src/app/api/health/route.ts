import { NextResponse } from "next/server";
import { tryGetPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const env = tryGetPublicEnv();
  if (!env) {
    return NextResponse.json(
      {
        ok: false,
        code: "missing_env",
        message:
          "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    // Verifica que las tablas existan (si no ejecutaste schema.sql, fallará).
    const { error: notesErr } = await supabase.from("notes").select("id").limit(1);
    if (notesErr) {
      return NextResponse.json(
        {
          ok: false,
          code: "schema_missing_or_denied",
          message: notesErr.message,
        },
        { status: 400 },
      );
    }

    const { error: templatesErr } = await supabase
      .from("templates")
      .select("id")
      .limit(1);
    if (templatesErr) {
      return NextResponse.json(
        {
          ok: false,
          code: "schema_missing_or_denied",
          message: templatesErr.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, code: "ready" });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: "error",
        message: e instanceof Error ? e.message : "Error",
      },
      { status: 500 },
    );
  }
}

