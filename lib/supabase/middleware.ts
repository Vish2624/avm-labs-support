import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/types/auth";

export interface SessionInfo {
  response: NextResponse;
  userId: string | null;
  role: UserRole | null;
}

/**
 * Refreshes the Supabase auth session cookie and resolves the current
 * user's role (via the same RLS-scoped client — user_profiles_select_own
 * lets a user read their own row). Called from the root proxy.ts, which
 * uses the result to gate protected routes.
 */
export async function updateSession(request: NextRequest): Promise<SessionInfo> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // No Supabase project configured yet — pass through untouched.
    return { response, userId: null, role: null };
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
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

  return { response, userId: user.id, role: (profile?.role as UserRole | undefined) ?? null };
}
