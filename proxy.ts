import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Server-side route protection — never rely on hiding a nav link alone
// (spec section 38/54). "/" itself just redirects to /workspace and is left
// alone here; that redirect target is what actually gets gated.
const PUBLIC_PATHS = ["/", "/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, userId, role } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (pathname === "/login" && userId) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  if (!isPublic && !userId) {
    const loginUrl = new URL("/login", request.url);
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
