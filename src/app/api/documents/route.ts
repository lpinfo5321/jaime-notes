import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "attachments";
const SIGNED_TTL = 60 * 60 * 6; // 6 hours

const createSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  mime_type: z.string().default(""),
  size: z.number().default(0),
  description: z.string().optional(),
});

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("documents")
    .select("id,name,path,mime_type,size,description,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Generate signed URLs for all docs
  const docs = data ?? [];
  const withUrls = await Promise.all(
    docs.map(async (doc) => {
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(doc.path, SIGNED_TTL);
        return { ...doc, url: signed?.signedUrl ?? null };
      } catch {
        return { ...doc, url: null };
      }
    }),
  );

  return NextResponse.json({ documents: withUrls });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => ({}));
  const input = createSchema.safeParse(json);
  if (!input.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data, error } = await supabase
    .from("documents")
    .insert({ user_id: user.id, ...input.data })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
