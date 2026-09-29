import { cookies } from "next/headers";
import { AppHeader } from "@/components/layout/app-header";
import { QuoteProvider } from "@/components/workspace/quote/quote-provider";
import { LOCATION_COOKIE } from "@/lib/constants/location-cookie";
import { requireUser } from "@/lib/auth/permissions";
import { listActiveLocations } from "@/lib/database/locations";

// requireUser() redirects to /login if unauthenticated — server-side
// enforcement here backs up proxy.ts (spec section 38: never rely on
// hiding a nav link, or on middleware, alone).
//
// The top header carries nav, the location picker and identity; every page
// gets the full remaining height to manage its own layout/scrolling (the
// Quote screen's two independently scrolling columns, in
// particular). `overflow-y-auto` here is a fallback for pages that don't
// manage their own internal scroll (e.g. Admin).
//
// QuoteProvider lives here (not on the Quote page) so the in-progress quote
// and chosen location survive navigating to Packages/Updates and back.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, locations, cookieStore] = await Promise.all([requireUser(), listActiveLocations(), cookies()]);
  // The agent's chosen location, from a cookie so the very first render
  // (and every data request it makes) already uses it — no flash of, and
  // no wasted requests for, the default location.
  const saved = cookieStore.get(LOCATION_COOKIE)?.value;
  const initialLocationId = locations.some((location) => location.id === saved) ? saved : undefined;

  return (
    <QuoteProvider locations={locations} initialLocationId={initialLocationId}>
      <div className="flex h-svh flex-col">
        <AppHeader user={user} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </QuoteProvider>
  );
}
