import { redirect } from "next/navigation";

// No standalone overview — /admin is kept only so the main nav's "Admin"
// link resolves, and bounces straight to the first real section.
export default function AdminPage() {
  redirect("/admin/upload");
}
