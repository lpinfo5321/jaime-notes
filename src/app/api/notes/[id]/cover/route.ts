import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    attachmentId: z.string().min(1),
    path: z.string().min(1),
    mimeType: z.string().min(1),
    filename: z.string().min(1),
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

  // Traer valores actuales para mergear _cover sin borrar otros campos
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
    _cover: {
      attachmentId: input.data.attachmentId,
      path: input.data.path,
      mimeType: input.data.mimeType,
      filename: input.data.filename,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase
    .from("notes")
    .update({ values: next })
    .eq("id", id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

