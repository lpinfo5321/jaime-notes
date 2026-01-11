export default function SetupPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            Configuración necesaria (Supabase)
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            La app ya está lista, pero falta conectar tu proyecto de Supabase
            para login/sincronización/archivos.
          </p>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="font-semibold">1) Crea Supabase</div>
              <div className="mt-1 text-zinc-700">
                En Supabase crea un proyecto y ejecuta{" "}
                <code className="rounded bg-white px-1">
                  supabase/schema.sql
                </code>{" "}
                en el SQL Editor. Luego crea el bucket{" "}
                <code className="rounded bg-white px-1">attachments</code>.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="font-semibold">2) Crea `.env.local`</div>
              <div className="mt-1 text-zinc-700">
                Copia <code className="rounded bg-white px-1">env.example</code>{" "}
                a <code className="rounded bg-white px-1">.env.local</code> y
                pega tus llaves:
              </div>
              <pre className="mt-2 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}
              </pre>
              <div className="mt-2 text-xs text-zinc-600">
                En Windows (PowerShell) dentro de <code>app-jaime</code>:
                <pre className="mt-2 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs">
{`Copy-Item env.example .env.local
notepad .env.local`}
                </pre>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="font-semibold">3) Reinicia `npm run dev`</div>
              <div className="mt-1 text-zinc-700">
                Al reiniciar, ya podrás entrar a <b>/login</b> y ver tus notas
                sincronizadas.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="font-semibold">4) Verificar</div>
              <div className="mt-1 text-zinc-700">
                Cuando termines, abre <code>/login</code>. Si algo falla, revisa
                el mensaje exacto y me lo pegas aquí.
              </div>
            </div>
          </div>

          <p className="mt-5 text-xs text-zinc-500">
            Si necesitas ayuda creando Supabase, dime y lo hacemos paso a paso.
          </p>
        </div>
      </div>
    </div>
  );
}

