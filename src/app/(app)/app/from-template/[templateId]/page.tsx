import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TemplateField } from "@/lib/types";

export default async function NewFromTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: t } = await supabase
    .from("templates")
    .select("id,name,fields")
    .eq("id", templateId)
    .single();

  if (!t) redirect("/templates");

  const fields = (t.fields ?? []) as TemplateField[];
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "checkbox") values[f.key] = false;
    else values[f.key] = "";
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: t.name,
      body: "",
      tags: [],
      favorite: false,
      template_id: t.id,
      template_snapshot: { id: t.id, name: t.name, fields },
      values,
    })
    .select("id")
    .single();

  if (error || !data?.id) redirect("/app");
  redirect(`/app/n/${data.id}`);
}

