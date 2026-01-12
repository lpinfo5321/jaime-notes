import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryGetPublicEnv } from "@/lib/env";
import ThemeToggle from "@/components/ThemeToggle";

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

  const companyName =
    process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "NOMBRE DE COMPAÑIA";

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/app"
              className="text-lg font-black uppercase tracking-wide"
            >
              {companyName}
            </Link>
            <nav className="hidden items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 md:flex">
              <Link
                href="/app"
                className="rounded-lg px-2 py-1 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                Notas
              </Link>
              <Link
                href="/templates"
                className="rounded-lg px-2 py-1 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                Plantillas
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action="/auth/logout" method="post">
              <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Solo se hace scroll aquí. Header permanece fijo. */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-4">{children}</div>
      </main>
    </div>
  );
}

