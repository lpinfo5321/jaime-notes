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
    .select("id,title,body,tags,favorite,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (fav) query = query.eq("favorite", true);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);

  const { data: notes, error } = await query;

  return (
    <div className="space-y-4">
      <NotesToolbar
        initial={{
          q,
          view,
          fav,
          tag,
        }}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando notas: {error.message}
        </div>
      ) : (
        <NotesList notes={notes ?? []} view={view} />
      )}
    </div>
  );
}

