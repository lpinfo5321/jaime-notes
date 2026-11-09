"use client";

import { useEffect, useState } from "react";

/** La abre el instalador ReturnChecks-Permiso.exe al terminar: marca esta computadora como lista. */
export default function PermisoCarpetasPage() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const yes = new URLSearchParams(window.location.search).get("ok") === "1";
    if (yes) {
      try {
        localStorage.setItem("rc:openLocal:v2", "1");
        localStorage.setItem("rc:openLocal:asked:v2", "1");
      } catch {}
    }
    setOk(yes);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-100 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white text-center shadow-2xl dark:bg-zinc-900">
        <div className="bg-zinc-900 px-6 pb-7 pt-8 text-white dark:bg-black">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime-400 text-lime-950">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight">{ok === false ? "Return Checks" : "¡Listo!"}</h1>
        </div>
        <div className="px-6 py-6">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {ok === false
              ? "Esta página se usa al dar permiso para abrir las carpetas de OneDrive."
              : "Esta computadora ya puede abrir los PDF en su carpeta de OneDrive. Puedes cerrar esta pestaña y volver a la app."}
          </p>
          <a href="/app" className="mt-5 inline-flex h-11 items-center rounded-full bg-zinc-900 px-6 text-sm font-extrabold text-white hover:bg-lime-400 hover:text-lime-950 dark:bg-lime-400 dark:text-lime-950">
            Ir a Return Checks
          </a>
        </div>
      </div>
    </main>
  );
}
