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

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  fields: z.array(fieldSchema).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("templates")
    .select("id,name,description,fields,updated_at,created_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  const input = createTemplateSchema.safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      name: input.data.name,
      description: input.data.description ?? null,
      fields: input.data.fields ?? [],
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

