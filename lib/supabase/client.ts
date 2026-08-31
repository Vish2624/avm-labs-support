import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser Supabase client. Uses the public anon key only, subject to RLS.
 *
 * Scope: auth session state (sign-in/out, "who am I") for Client Components.
 * All actual data (tests, pricing, imports) is fetched server-side via
 * createServiceRoleClient (./service.ts) — never queried from the browser.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
