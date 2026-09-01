import { Badge } from "@/components/ui/badge";
import type { ImportRowIssue } from "@/types/import";

// Row-level validation error/warning list, sorted by row number.
export function ValidationErrors({ issues }: { issues: ImportRowIssue[] }) {
  if (issues.length === 0) return null;

  const sorted = [...issues].sort((a, b) => a.row - b.row);

  return (
    <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
      {sorted.map((issue, index) => (
        <li key={`${issue.row}-${issue.field}-${index}`} className="flex items-start gap-2">
          <Badge variant={issue.severity === "error" ? "destructive" : "secondary"} className="mt-0.5 shrink-0">
            {issue.row === 0 ? "File" : `Row ${issue.row}`}
          </Badge>
          <span className="text-muted-foreground">{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}
