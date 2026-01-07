import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NewNotePage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: "",
      body: "",
      tags: [],
      favorite: false,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    // fallback a lista si algo falla (ej. no ejecutaste el SQL todavía)
    redirect("/app");
  }

  redirect(`/app/n/${data.id}`);
}

