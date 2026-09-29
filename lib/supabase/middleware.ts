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

  // getClaims() verifies the session JWT's signature locally against the
  // project's cached public keys (asymmetric signing keys), refreshing an
  // expired session first — no Auth-server round trip per request, unlike
  // getUser(), which cost 1-4 s on every page and API call.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (!userId) {
    return { response, userId: null, role: null };
  }

  const role = await roleFor(userId, () =>
    supabase.from("user_profiles").select("role").eq("user_id", userId).maybeSingle()
  );

  requestHeaders.set("x-user-id", userId);
  if (typeof claims?.email === "string") requestHeaders.set("x-user-email", claims.email);
  if (role) requestHeaders.set("x-user-role", role);
  response = buildResponse();
  applyPendingCookies();

  return { response, userId, role };
}

/** How long a user's role is reused before it's looked up again. */
const ROLE_TTL_MS = 5 * 60_000;
const roleCache = new Map<string, { role: UserRole | null; at: number }>();

/**
 * The user's role from user_profiles, remembered per server instance for
 * ROLE_TTL_MS so it isn't a database round trip on every request. (A role
 * change takes effect within 5 minutes; every Admin page/API still checks
 * requireAdmin() on its own.) One retry on a failed lookup, and a failure
 * is never cached: a brief network blip would otherwise read as "no role",
 * and proxy.ts would bounce an admin who refreshed an Admin page back to
 * /workspace.
 */
async function roleFor(
  userId: string,
  lookup: () => PromiseLike<{ data: { role: string } | null; error: unknown }>
): Promise<UserRole | null> {
  const cached = roleCache.get(userId);
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) return cached.role;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: profile, error } = await lookup();
    if (!error) {
      const role = (profile?.role as UserRole | undefined) ?? null;
      roleCache.set(userId, { role, at: Date.now() });
      return role;
    }
  }
  return null;
}
