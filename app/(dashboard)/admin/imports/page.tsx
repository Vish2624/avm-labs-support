import { redirect } from "next/navigation";

// Import History was removed from the Admin section; old links land on Upload.
export default function ImportsPage() {
  redirect("/admin/upload");
}
