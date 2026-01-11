import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryGetPublicEnv } from "@/lib/env";
import AppHeader from "@/components/AppHeader";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Si faltan env vars (o no están en Vercel), manda a /setup desde runtime Node.
  if (!tryGetPublicEnv()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

