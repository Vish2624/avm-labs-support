import { Badge } from "@/components/ui/badge";
import type { AuditLogEntry } from "@/types/import";

const ACTION_LABELS: Record<string, string> = {
  export_tests: "Test catalog",
  export_prices: "Price list",
};

// Past exports — sourced from audit_log (every export records an entry
// there), not a separate tracking system.
export function ExportHistory({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No exports yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-2">
          <Badge variant="outline">{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
          <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
