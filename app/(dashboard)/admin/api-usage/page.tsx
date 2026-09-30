import { redirect } from "next/navigation";

// API usage now lives on the System health page.
export default function ApiUsagePage() {
  redirect("/admin/health");
}
