import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    payload: z
      .object({
        reports: z.array(z.unknown()),
        activeId: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .strict();

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
      ...input.data.payload,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase.from("notes").update({ values: next }).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

