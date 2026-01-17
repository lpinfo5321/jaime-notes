import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    payload: z.unknown(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: note, error } = await supabase
    .from("notes")
    .select("values")
    .eq("id", id)
    .single();

  if (error || !note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const v = (note.values ?? {}) as any;
  const payload = v?._report?.payload ?? null;
  const updatedAt = v?._report?.updatedAt ?? null;
  return NextResponse.json({ payload, updatedAt }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  const input = schema.safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Merge into values without clobbering other keys (_entries, _cover, etc.)
  const { data: note, error: readErr } = await supabase
    .from("notes")
    .select("id,values")
    .eq("id", id)
    .single();
  if (readErr || !note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prev = (note.values ?? {}) as Record<string, unknown>;
  const next = {
    ...prev,
    _report: {
      payload: input.data.payload,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase.from("notes").update({ values: next }).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

