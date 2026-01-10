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

  // Adjuntos: para mostrar miniatura/contador en las tarjetas
  const noteIds = safeNotes.map((n: any) => String(n.id));
  const attachmentMetaByNoteId: Record<
    string,
    { total: number; images: number; docs: number; firstDocName?: string }
  > = {};

  const { data: attachments } = noteIds.length
    ? await supabase
        .from("attachments")
        .select("id,note_id,path,filename,mime_type,created_at")
        .in("note_id", noteIds)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] as any[] };

  const firstImagePathByNoteId: Record<string, string> = {};
  for (const a of (attachments ?? []) as any[]) {
    const nid = String(a.note_id);
    const mime = String(a.mime_type ?? "");
    const isImg = mime.startsWith("image/");
    const isDoc = !isImg;

    const meta = (attachmentMetaByNoteId[nid] ??= {
      total: 0,
      images: 0,
      docs: 0,
    });
    meta.total += 1;
    if (isImg) meta.images += 1;
    if (isDoc) meta.docs += 1;
    if (isDoc && !meta.firstDocName && typeof a.filename === "string") {
      meta.firstDocName = a.filename;
    }

    if (isImg && !firstImagePathByNoteId[nid] && typeof a.path === "string") {
      firstImagePathByNoteId[nid] = a.path;
    }
  }

  // Portada: preferimos values._cover.path, si no, la primera imagen adjunta
  const coverUrls: Record<string, string> = {};
  const coverPaths: Record<string, string> = {};
  for (const n of safeNotes as any[]) {
    const id = String(n.id);
    const cover = n?.values?._cover;
    const fromValues =
      cover?.path && typeof cover.path === "string" ? String(cover.path) : null;
    const fromAttachments = firstImagePathByNoteId[id] ?? null;
    const path = fromValues ?? fromAttachments;
    if (path) coverPaths[id] = path;
  }

  await Promise.all(
    Object.entries(coverPaths)
      .slice(0, 60)
      .map(async ([noteId, path]) => {
        const { data } = await supabase.storage
          .from("attachments")
          .createSignedUrl(path, 60 * 15);
        if (data?.signedUrl) coverUrls[noteId] = data.signedUrl;
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
        <NotesList
          notes={safeNotes as any}
          view={view}
          coverUrls={coverUrls}
          attachmentMetaByNoteId={attachmentMetaByNoteId}
        />
      )}
    </div>
  );
}

