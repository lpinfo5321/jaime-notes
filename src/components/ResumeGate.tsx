"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LastRoute = { v: 1; ts: number; url: string };

export const LAST_ROUTE_KEY = "rc:lastRoute:v1";
export const DISABLE_RESUME_ONCE_KEY = "rc:disableResumeOnce:v1";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isRestorableUrl(url: string) {
  return url.startsWith("/app") || url.startsWith("/templates");
}

function currentUrl(pathname: string, sp: URLSearchParams) {
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}

function normalizeStoredUrl(url: string) {
  // Nunca persistir parámetros "de una sola vez" (ej. openReport)
  // porque al recargar se vuelven a ejecutar.
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.delete("openReport");
    const q = u.searchParams.toString();
    return q ? `${u.pathname}?${q}` : u.pathname;
  } catch {
    // Fallback: quitar openReport a mano
    try {
      const [p, qs] = url.split("?", 2);
      if (!qs) return url;
      const params = new URLSearchParams(qs);
      params.delete("openReport");
      const q = params.toString();
      return q ? `${p}?${q}` : p;
    } catch {
      return url;
    }
  }
}

function scrollKey(url: string) {
  return `rc:scrollY:v1:${normalizeStoredUrl(url)}`;
}

function readLastRoute(): LastRoute | null {
  if (typeof window === "undefined") return null;
  const data = safeJsonParse<LastRoute>(window.localStorage.getItem(LAST_ROUTE_KEY));
  if (!data || data.v !== 1) return null;
  if (typeof data.ts !== "number") return null;
  if (typeof data.url !== "string") return null;
  return { ...data, url: normalizeStoredUrl(data.url) };
}

function writeLastRoute(url: string) {
  if (typeof window === "undefined") return;
  try {
    const payload: LastRoute = { v: 1, ts: Date.now(), url: normalizeStoredUrl(url) };
    window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function readScrollY(url: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(scrollKey(url));
    const n = Number(raw ?? "0");
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function writeScrollY(url: string, y: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scrollKey(url), String(Math.max(0, Math.floor(y))));
  } catch {
    // ignore
  }
}

export default function ResumeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const url = useMemo(() => currentUrl(pathname, sp), [pathname, sp]);
  const storedUrl = useMemo(() => normalizeStoredUrl(url), [url]);
  const [ready, setReady] = useState(false);
  const didInitRef = useRef(false);

  // Restore before paint to avoid "jump"
  useLayoutEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    if (typeof window === "undefined") {
      setReady(true);
      return;
    }

    // allow a one-time manual "go home"
    try {
      if (window.sessionStorage.getItem(DISABLE_RESUME_ONCE_KEY)) {
        window.sessionStorage.removeItem(DISABLE_RESUME_ONCE_KEY);
        // still restore scroll for this route
        const y = readScrollY(storedUrl);
        if (y) window.scrollTo(0, y);
        setReady(true);
        return;
      }
    } catch {}

    const last = readLastRoute();
    const isLandingHome = storedUrl === "/app" || storedUrl.startsWith("/app?");
    const canRedirect = isLandingHome && last?.url && isRestorableUrl(last.url) && last.url !== url;

    // If user opened /app (login redirect / bookmark), resume last route.
    if (canRedirect) {
      setReady(false);
      router.replace(last!.url);
      return;
    }

    const y = readScrollY(storedUrl);
    if (y) window.scrollTo(0, y);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track current route
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isRestorableUrl(storedUrl)) return;
    writeLastRoute(storedUrl);
  }, [storedUrl]);

  // Track scroll per route
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isRestorableUrl(storedUrl)) return;
    let t: number | null = null;
    const onScroll = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        writeScrollY(storedUrl, window.scrollY || 0);
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (t) window.clearTimeout(t);
    };
  }, [storedUrl]);

  return <div style={{ visibility: ready ? "visible" : "hidden" }}>{children}</div>;
}

