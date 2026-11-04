import { createClient } from "@/lib/supabase/server";
import NotesList from "@/components/notes/NotesList";

type NotesSearchParams = {
  q?: string;
  qBy?: string;
  status?: string;
};

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<NotesSearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const qBy = (sp.qBy ?? "company").trim() || "company";

  let query = supabase
    .from("notes")
    .select(
      "id,title,body,tags,favorite,template_snapshot,values,updated_at,created_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  // La búsqueda (compañía, cliente, teléfono, PAY) se filtra en el cliente: así también encuentra
  // compañías por el nombre/teléfono de sus contactos.
  void q;
  void qBy;

  const { data: notes, error } = await query;
  const safeNotes = notes ?? [];

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

  // Portada: preferimos values._coverInline.dataUrl; si no, values._cover.path; si no, la primera imagen adjunta
  const coverUrls: Record<string, string> = {};
  const coverPaths: Record<string, string> = {};
  for (const n of safeNotes as any[]) {
    const id = String(n.id);
    const inline =
      typeof n?.values?._coverInline?.dataUrl === "string" ? String(n.values._coverInline.dataUrl) : null;
    if (inline && inline.startsWith("data:image/")) {
      coverUrls[id] = inline;
      continue;
    }
    const cover = n?.values?._cover;
    const fromValues =
      cover?.path && typeof cover.path === "string" ? String(cover.path) : null;
    const fromAttachments = firstImagePathByNoteId[id] ?? null;
    const path = fromValues ?? fromAttachments;
    if (path) coverPaths[id] = path;
  }

  // Una sola petición para TODAS las URLs firmadas (antes era una petición por archivo).
  const coverEntries = Object.entries(coverPaths).slice(0, 60);
  const docEntries = Object.entries(firstDocByNoteId).slice(0, 120);
  const allPaths = Array.from(
    new Set([...coverEntries.map(([, p]) => p), ...docEntries.map(([, d]) => d.path)]),
  );
  const signedByPath = new Map<string, string>();
  if (allPaths.length) {
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrls(allPaths, 60 * 60 * 24);
    for (const s of signed ?? []) {
      if (s?.path && s?.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }
  for (const [noteId, path] of coverEntries) {
    const url = signedByPath.get(path);
    if (url) coverUrls[noteId] = url;
  }

  // Primer documento (link directo desde la tarjeta)
  const firstDocUrlsByNoteId: Record<
    string,
    { url: string; filename: string; mime: string }
  > = {};
  for (const [noteId, doc] of docEntries) {
    const url = signedByPath.get(doc.path);
    if (url) firstDocUrlsByNoteId[noteId] = { url, filename: doc.filename, mime: doc.mime };
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando notas: {error.message}
        </div>
      ) : (
        <NotesList
          notes={safeNotes as any}
          coverUrls={coverUrls}
          attachmentMetaByNoteId={attachmentMetaByNoteId}
          firstDocUrlsByNoteId={firstDocUrlsByNoteId}
        />
      )}
    </div>
  );
}

