import { redirect } from "next/navigation";

// The Support Workspace is the app's real landing page; /dashboard is kept
// only so existing links/redirects resolve, and bounces straight there.
export default function DashboardPage() {
  redirect("/workspace");
}
