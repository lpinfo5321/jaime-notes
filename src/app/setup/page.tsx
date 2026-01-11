export default function SetupPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold tracking-tight dark:text-zinc-50">
            Configuración necesaria (Supabase)
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            La app ya está lista, pero falta conectar tu proyecto de Supabase
            para login/sincronización/archivos.
          </p>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="font-semibold dark:text-zinc-100">1) Crea Supabase</div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                En Supabase crea un proyecto y ejecuta{" "}
                <code className="rounded bg-white px-1 dark:bg-zinc-900 dark:text-zinc-100">
                  supabase/schema.sql
                </code>{" "}
                en el SQL Editor. Luego crea el bucket{" "}
                <code className="rounded bg-white px-1 dark:bg-zinc-900 dark:text-zinc-100">attachments</code>.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="font-semibold dark:text-zinc-100">2) Crea `.env.local`</div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                Copia <code className="rounded bg-white px-1 dark:bg-zinc-900 dark:text-zinc-100">env.example</code>{" "}
                a <code className="rounded bg-white px-1 dark:bg-zinc-900 dark:text-zinc-100">.env.local</code> y
                pega tus llaves:
              </div>
              <pre className="mt-2 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}
              </pre>
              <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                En Windows (PowerShell) dentro de <code className="dark:text-zinc-300">app-jaime</code>:
                <pre className="mt-2 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
{`Copy-Item env.example .env.local
notepad .env.local`}
                </pre>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="font-semibold dark:text-zinc-100">3) Reinicia `npm run dev`</div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                Al reiniciar, ya podrás entrar a <b>/login</b> y ver tus notas
                sincronizadas.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="font-semibold dark:text-zinc-100">4) Verificar</div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                Cuando termines, abre <code className="dark:text-zinc-300">/login</code>. Si algo falla, revisa
                el mensaje exacto y me lo pegas aquí.
              </div>
            </div>
          </div>

          <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">
            Si necesitas ayuda creando Supabase, dime y lo hacemos paso a paso.
          </p>
        </div>
      </div>
    </div>
  );
}

