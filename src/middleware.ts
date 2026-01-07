import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { tryGetPublicEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/app", "/api/notes", "/api/templates"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasEnv = !!tryGetPublicEnv();

  // Si todavía no configuraste Supabase, no crashees: manda a /setup
  if (!hasEnv) {
    if (pathname === "/setup") return NextResponse.next();
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/public")
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const { supabase, response } = updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

