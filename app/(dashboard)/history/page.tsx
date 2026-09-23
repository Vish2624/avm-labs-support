import { HistoryClient } from "@/components/history/history-client";

// Quote History — replies copied in the last 2 days. Auth is enforced by
// the parent (dashboard) layout's requireUser(); data loads client-side
// from /api/quotes so it stays fresh as agents copy new replies.
export default function HistoryPage() {
  return <HistoryClient />;
}
