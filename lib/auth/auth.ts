import "server-only";
import { headers } from "next/headers";
import { createAuthServerClient } from "@/lib/supabase/server";
import type { AuthUser, UserRole } from "@/types/auth";

const VALID_ROLES: readonly UserRole[] = ["support", "admin"];

/**
 * Current authenticated user + role, or null if not signed in.
 *
 * proxy.ts (lib/supabase/middleware.ts) already runs a real
 * `auth.getUser()` + role lookup against Supabase for every request this
 * app serves, then stamps the verified result onto `x-user-*` request
 * headers (never trusting any client-supplied value of the same name —
 * proxy.ts strips those before setting its own). Reading that here avoids
 * repeating the exact same pair of network round-trips a second time on
 * every single page/route — with this app's Supabase project, that
 * redundant check was roughly half of total page-load latency.
 *
 * Falls back to a real Supabase check (the original behavior) for any
 * request that reached here without going through proxy.ts — normally
 * shouldn't happen given its matcher, but keeps this function correct on
 * its own rather than silently trusting an absent header.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const headerList = await headers();
  const trustedId = headerList.get("x-user-id");
  const trustedRole = headerList.get("x-user-role");
  const trustedEmail = headerList.get("x-user-email");

  if (trustedId && trustedRole && VALID_ROLES.includes(trustedRole as UserRole)) {
    return { id: trustedId, email: trustedEmail ?? "", role: trustedRole as UserRole };
  }

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
