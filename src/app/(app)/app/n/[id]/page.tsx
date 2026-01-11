import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NoteEditor from "@/components/notes/NoteEditor";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: note } = await supabase
    .from("notes")
    .select("id,title,body,tags,favorite,template_snapshot,values,updated_at,created_at")
    .eq("id", id)
    .single();

  if (!note) notFound();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/app"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          ← Volver
        </Link>
      </div>
      <NoteEditor note={note} />
    </div>
  );
}

