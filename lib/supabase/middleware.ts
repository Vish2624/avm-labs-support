import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/types/auth";

export interface SessionInfo {
  response: NextResponse;
  userId: string | null;
  role: UserRole | null;
}

/** Request headers proxy.ts hands the already-verified identity through on. */
export const TRUSTED_USER_HEADERS = ["x-user-id", "x-user-email", "x-user-role"] as const;

/**
 * Refreshes the Supabase auth session cookie and resolves the current
 * user's role (via the same RLS-scoped client — user_profiles_select_own
 * lets a user read their own row). Called from the root proxy.ts, which
 * uses the result to gate protected routes.
 *
 * Also stamps the resolved identity onto trusted request headers so
 * downstream Server Components/Route Handlers' own requireUser()/
 * requireAdmin() check (lib/auth/permissions.ts — kept as real
 * defense-in-depth, never relying on proxy.ts alone) can skip repeating
 * this same pair of Supabase round-trips. Any client-supplied values for
 * these headers are stripped first — they're set from nothing but this
 * function's own freshly-verified `auth.getUser()` result.
 */
export async function updateSession(request: NextRequest): Promise<SessionInfo> {
  const requestHeaders = new Headers(request.headers);
  for (const name of TRUSTED_USER_HEADERS) requestHeaders.delete(name);

  const buildResponse = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = buildResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // No Supabase project configured yet — pass through untouched.
    return { response, userId: null, role: null };
  }

  let pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const applyPendingCookies = () => pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies = cookiesToSet;
        response = buildResponse();
        applyPendingCookies();
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { response, userId: null, role: null };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? null;

  requestHeaders.set("x-user-id", user.id);
  if (user.email) requestHeaders.set("x-user-email", user.email);
  if (role) requestHeaders.set("x-user-role", role);
  response = buildResponse();
  applyPendingCookies();

  return { response, userId: user.id, role };
}
