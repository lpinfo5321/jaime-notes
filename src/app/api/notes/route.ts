import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createNoteSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const fav = url.searchParams.get("fav") === "1";
  const tag = (url.searchParams.get("tag") ?? "").trim();

  let query = supabase
    .from("notes")
    .select("id,title,body,tags,favorite,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (fav) query = query.eq("favorite", true);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  const input = createNoteSchema.safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: input.data.title ?? "",
      body: input.data.body ?? "",
      tags: input.data.tags ?? [],
      favorite: input.data.favorite ?? false,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

