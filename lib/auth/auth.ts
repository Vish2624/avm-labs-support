import "server-only";
import { createAuthServerClient } from "@/lib/supabase/server";
import type { AuthUser, UserRole } from "@/types/auth";

/**
 * Current authenticated user + role, or null if not signed in.
 * Reads user_profiles through the RLS-scoped client (not the admin client) —
 * the user_profiles_select_own policy allows a user to read their own row,
 * so this exercises the real RLS path rather than always bypassing it.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as UserRole,
  };
}

export async function signOut() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
}
