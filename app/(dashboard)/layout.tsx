import { AppHeader } from "@/components/layout/app-header";
import { QuoteProvider } from "@/components/workspace/quote-provider";
import { requireUser } from "@/lib/auth/permissions";
import { listActiveLocations } from "@/lib/database/locations";

// requireUser() redirects to /login if unauthenticated — server-side
// enforcement here backs up proxy.ts (spec section 38: never rely on
// hiding a nav link, or on middleware, alone).
//
// The top header carries nav, the location picker and identity; every page
// gets the full remaining height to manage its own layout/scrolling (the
// Quote and History screens' two independently scrolling columns, in
// particular). `overflow-y-auto` here is a fallback for pages that don't
// manage their own internal scroll (e.g. Admin).
//
// QuoteProvider lives here (not on the Quote page) so the in-progress quote
// and chosen location survive navigating to History/Packages and back.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, locations] = await Promise.all([requireUser(), listActiveLocations()]);

  return (
    <QuoteProvider locations={locations}>
      <div className="flex h-svh flex-col">
        <AppHeader user={user} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </QuoteProvider>
  );
}
