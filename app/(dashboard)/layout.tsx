import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// TODO: redirect to /login if unauthenticated / gate on the agent access
// token, once auth (Phase 2) is implemented.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
