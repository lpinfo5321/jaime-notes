/** Se muestra al instante mientras carga /app (evita la sensación de "se trabó"). */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-10 w-2/3 max-w-md animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-3xl border border-zinc-200/70 bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/60"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
