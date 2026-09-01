import { requireAdmin } from "@/lib/auth/permissions";

// Defense-in-depth alongside proxy.ts: redirects non-admins to /dashboard
// server-side, so Admin pages/APIs can never be reached by URL alone
// (spec section 38: never rely on hiding the Admin nav link alone).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="p-6">{children}</div>;
}
