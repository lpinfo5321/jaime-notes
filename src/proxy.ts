import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { tryGetPublicEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/app", "/api/notes", "/api/templates"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasEnv = !!tryGetPublicEnv();

  if (!hasEnv) return NextResponse.next();

  const { supabase, response } = updateSession(request);

  // getClaims valida el token localmente (sin ir a la red en cada clic) y lo renueva si hace falta.
  const {
    data: claimsData,
  } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
