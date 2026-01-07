import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "date",
    "select",
    "checkbox",
    "phone",
    "currency",
  ]),
  label: z.string().min(1),
  key: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  section: z.string().optional(),
  width: z.enum(["half", "full"]).optional(),
  placeholder: z.string().optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    fields: z.array(fieldSchema).optional(),
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

  const { error } = await supabase
    .from("templates")
    .update(input.data)
    .eq("id", id);

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

  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

