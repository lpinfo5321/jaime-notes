import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryGetPublicEnv } from "@/lib/env";

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
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-sm font-semibold tracking-tight">
              Jaime Notes
            </Link>
            <nav className="flex items-center gap-2 text-sm text-zinc-600">
              <Link
                href="/app"
                className="rounded-lg px-2 py-1 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Notas
              </Link>
              <Link
                href="/templates"
                className="rounded-lg px-2 py-1 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Plantillas
              </Link>
            </nav>
          </div>

          <form action="/auth/logout" method="post">
            <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

