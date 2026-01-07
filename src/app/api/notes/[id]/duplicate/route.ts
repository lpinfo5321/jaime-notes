import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: note, error: readErr } = await supabase
    .from("notes")
    .select("title,body,tags,favorite,template_id,template_snapshot,values")
    .eq("id", id)
    .single();

  if (readErr || !note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: created, error: createErr } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: note.title?.trim() ? `${note.title} (copia)` : "Copia",
      body: note.body ?? "",
      tags: note.tags ?? [],
      favorite: false,
      template_id: note.template_id ?? null,
      template_snapshot: note.template_snapshot ?? null,
      values: note.values ?? null,
    })
    .select("id")
    .single();

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? "Error" }, { status: 400 });
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}

