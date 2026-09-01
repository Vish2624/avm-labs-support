import { requireAdmin } from "@/lib/auth/permissions";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

// Defense-in-depth alongside proxy.ts: redirects non-admins to /dashboard
// server-side, so Admin pages/APIs can never be reached by URL alone
// (spec section 38: never rely on hiding the Admin nav link alone).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4 p-6">
      <AdminSidebar />
      {children}
    </div>
  );
}
