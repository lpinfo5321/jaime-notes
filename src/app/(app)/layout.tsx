import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryGetPublicEnv } from "@/lib/env";
import AppHeader from "@/components/AppHeader";
import ResumeGate from "@/components/ResumeGate";
import DashFrame from "@/components/dashboard/DashFrame";
import AppTour from "@/components/AppTour";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Si faltan env vars (o no están en Vercel), manda a /setup desde runtime Node.
  if (!tryGetPublicEnv()) redirect("/setup");

  const supabase = await createClient();
  // Rápido: valida el token localmente (el proxy ya lo verificó/renovó en esta petición).
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  return (
    <div className="min-h-dvh text-zinc-900 dark:text-zinc-50">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-5">
        <ResumeGate>
          <DashFrame>{children}</DashFrame>
        </ResumeGate>
      </main>
      <AppTour />
    </div>
  );
}

