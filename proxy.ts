import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { safeNextPath } from "@/lib/auth/next-path";

// Server-side route protection — never rely on hiding a nav link alone
// (spec section 38/54). "/" itself just redirects to /workspace and is left
// alone here; that redirect target is what actually gets gated.
const PUBLIC_PATHS = ["/", "/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, userId, role } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (pathname === "/login" && userId) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next ?? "/workspace", request.url));
  }

  if (!isPublic && !userId) {
    // Remember the page, so signing in again returns to it (API calls excepted).
    const loginUrl = new URL("/login", request.url);
    if (!pathname.startsWith("/api/")) loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets, so the auth session cookie
     * stays fresh across navigations and protected routes are gated.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
