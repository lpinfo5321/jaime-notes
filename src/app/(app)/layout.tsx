import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryGetPublicEnv } from "@/lib/env";
import AppHeader from "@/components/AppHeader";
import ResumeGate from "@/components/ResumeGate";

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
    <div className="min-h-dvh text-zinc-900 dark:text-zinc-50">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 py-4">
        <ResumeGate>{children}</ResumeGate>
      </main>
    </div>
  );
}

