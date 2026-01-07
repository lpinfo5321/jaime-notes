import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NewTemplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      name: "Nueva plantilla",
      description: null,
      fields: [],
    })
    .select("id")
    .single();

  if (error || !data?.id) redirect("/templates");
  redirect(`/templates/${data.id}`);
}

