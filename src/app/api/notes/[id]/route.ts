import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    favorite: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function PATCH(
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
  const input = patchSchema.safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const patch = input.data;

  // IMPORTANT:
  // `values` is a JSON blob that is updated from multiple UIs (notes, report, attachments).
  // If we overwrite it, we can accidentally delete keys written elsewhere (e.g. _report).
  // So when PATCH includes `values`, we merge it with the latest server `values`.
  let updatePayload: typeof patch = patch;
  if (patch.values) {
    const { data: note, error: readErr } = await supabase
      .from("notes")
      .select("values")
      .eq("id", id)
      .single();
    if (readErr || !note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const prev = ((note as any).values ?? {}) as Record<string, unknown>;
    updatePayload = {
      ...patch,
      values: { ...prev, ...(patch.values ?? {}) },
    };
  }

  const { error } = await supabase.from("notes").update(updatePayload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

