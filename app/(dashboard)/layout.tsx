import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth/permissions";

// requireUser() redirects to /login if unauthenticated — server-side
// enforcement here backs up proxy.ts (spec section 38: never rely on
// hiding a nav link, or on middleware, alone).
//
// No separate topbar: the icon rail carries the logo, identity, sign out,
// and theme toggle, so every page gets the full remaining height to manage
// its own layout/scrolling (the Support Workspace's two independently
// scrolling columns, in particular). `overflow-y-auto` here is a fallback
// for pages that don't manage their own internal scroll (e.g. Admin) — it's
// a no-op for pages sized to exactly fill this height.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-svh">
      <Sidebar user={user} />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
