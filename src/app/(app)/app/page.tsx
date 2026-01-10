import { createClient } from "@/lib/supabase/server";
import NotesToolbar from "@/components/notes/NotesToolbar";
import NotesList from "@/components/notes/NotesList";

type NotesSearchParams = {
  q?: string;
  view?: "grid" | "list";
  fav?: "1" | "0";
  tag?: string;
};

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<NotesSearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const view = sp.view === "list" ? "list" : "grid";
  const fav = sp.fav === "1";
  const tag = (sp.tag ?? "").trim();

  let query = supabase
    .from("notes")
    .select(
      "id,title,body,tags,favorite,template_snapshot,values,updated_at,created_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (fav) query = query.eq("favorite", true);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);

  const { data: notes, error } = await query;
  const safeNotes = notes ?? [];

  const tagCounts = new Map<string, number>();
  for (const n of safeNotes) {
    for (const t of (n.tags ?? []) as string[]) {
      const k = String(t);
      tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);

  // Portada: si la nota tiene values._cover.path, generamos URL firmada
  const coverUrls: Record<string, string> = {};
  await Promise.all(
    safeNotes.slice(0, 60).map(async (n: any) => {
      const cover = n?.values?._cover;
      if (!cover?.path || typeof cover.path !== "string") return;
      const { data } = await supabase.storage
        .from("attachments")
        .createSignedUrl(String(cover.path), 60 * 15);
      if (data?.signedUrl) coverUrls[String(n.id)] = data.signedUrl;
    }),
  );

  return (
    <div className="space-y-4">
      <NotesToolbar
        initial={{
          q,
          view,
          fav,
          tag,
        }}
        topTags={topTags}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando notas: {error.message}
        </div>
      ) : (
        <NotesList notes={safeNotes as any} view={view} coverUrls={coverUrls} />
      )}
    </div>
  );
}

