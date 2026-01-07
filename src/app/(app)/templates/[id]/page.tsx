import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TemplateEditor from "@/components/templates/TemplateEditor";
import type { TemplateField } from "@/lib/types";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("templates")
    .select("id,name,description,fields,updated_at,created_at")
    .eq("id", id)
    .single();

  if (!t) notFound();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/templates"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Volver
        </Link>
        <Link
          href={`/app/from-template/${t.id}`}
          className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Crear nota con esta plantilla
        </Link>
      </div>

      <TemplateEditor
        template={{
          id: t.id,
          name: t.name,
          description: t.description,
          fields: (t.fields ?? []) as TemplateField[],
          updated_at: t.updated_at,
          created_at: t.created_at,
        }}
      />
    </div>
  );
}

