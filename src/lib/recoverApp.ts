/** Recupera la app cuando quedó con archivos viejos tras una actualización (pantalla en blanco). */
const GUARD = "rc:recover:ts";

export function isStaleBuildError(msg: unknown) {
  const s = String((msg as { message?: string } | null)?.message ?? msg ?? "");
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically|Importing a module script failed|client-side exception|Minified React error|Server Action .* not found|Failed to find Server Action/i.test(s);
}

export async function recoverApp(force = false) {
  try {
    const last = Number(sessionStorage.getItem(GUARD) || 0);
    if (!force && Date.now() - last < 30_000) return false;
    sessionStorage.setItem(GUARD, String(Date.now()));
  } catch {}
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch {}
  window.location.replace(window.location.pathname + window.location.search.replace(/[?&]v=\d+/, "") + (window.location.search ? "&" : "?") + "v=" + Date.now());
  return true;
}
