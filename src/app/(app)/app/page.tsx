import { createClient } from "@/lib/supabase/server";
import NotesToolbar from "@/components/notes/NotesToolbar";
import NotesList from "@/components/notes/NotesList";
import FeaturedNoteCard from "@/components/notes/FeaturedNoteCard";

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
  const companyName = (process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Jaime Notes")
    .trim()
    .toUpperCase();

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

  // Adjuntos: para mostrar miniaturas/contador en las tarjetas
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
  const imageThumbPathsByNoteId: Record<string, string[]> = {};
  const firstDocByNoteId: Record<
    string,
    { path: string; filename: string; mime: string }
  > = {};

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

    if (isImg && typeof a.path === "string") {
      const arr = (imageThumbPathsByNoteId[nid] ??= []);
      if (arr.length < 3) arr.push(a.path);
    }

    if (
      isDoc &&
      !firstDocByNoteId[nid] &&
      typeof a.path === "string" &&
      typeof a.filename === "string"
    ) {
      firstDocByNoteId[nid] = {
        path: a.path,
        filename: a.filename,
        mime,
      };
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

  // Miniaturas (hasta 3 imágenes por nota)
  const thumbUrlsByNoteId: Record<string, string[]> = {};
  await Promise.all(
    Object.entries(imageThumbPathsByNoteId)
      .slice(0, 80)
      .map(async ([noteId, paths]) => {
        const urls: string[] = [];
        for (const p of paths) {
          const { data } = await supabase.storage
            .from("attachments")
            .createSignedUrl(p, 60 * 10);
          if (data?.signedUrl) urls.push(data.signedUrl);
        }
        if (urls.length) thumbUrlsByNoteId[noteId] = urls;
      }),
  );

  // Primer documento (link directo desde la tarjeta)
  const firstDocUrlsByNoteId: Record<
    string,
    { url: string; filename: string; mime: string }
  > = {};
  await Promise.all(
    Object.entries(firstDocByNoteId)
      .slice(0, 120)
      .map(async ([noteId, doc]) => {
        const { data } = await supabase.storage
          .from("attachments")
          .createSignedUrl(doc.path, 60 * 10);
        if (data?.signedUrl) {
          firstDocUrlsByNoteId[noteId] = {
            url: data.signedUrl,
            filename: doc.filename,
            mime: doc.mime,
          };
        }
      }),
  );

  const latest = safeNotes.length ? (safeNotes[0] as any) : null;
  const latestId = latest ? String(latest.id) : null;
  const latestCover = latestId ? coverUrls[latestId] : null;
  const latestThumb = latestId ? thumbUrlsByNoteId[latestId]?.[0] : null;
  const latestDoc = latestId ? firstDocUrlsByNoteId[latestId] : null;
  const latestMeta = latestId ? attachmentMetaByNoteId[latestId] : null;

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
        <div className="space-y-5">
          {view === "grid" && latest ? (
            <FeaturedNoteCard
              companyName={companyName}
              note={{
                id: String(latest.id),
                title: String(latest.title ?? ""),
                body: String(latest.body ?? ""),
                tags: (latest.tags ?? []) as string[],
                template_snapshot: latest.template_snapshot,
                updated_at: String(latest.updated_at),
              }}
              coverUrl={latestCover ?? latestThumb ?? null}
              firstDoc={latestDoc ?? null}
              meta={latestMeta ?? null}
            />
          ) : null}

          <NotesList
            notes={(view === "grid" ? safeNotes.slice(1) : safeNotes) as any}
            view={view}
            coverUrls={coverUrls}
            attachmentMetaByNoteId={attachmentMetaByNoteId}
            thumbUrlsByNoteId={thumbUrlsByNoteId}
            firstDocUrlsByNoteId={firstDocUrlsByNoteId}
          />
        </div>
      )}
    </div>
  );
}

