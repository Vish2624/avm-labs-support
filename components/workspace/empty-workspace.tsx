import { SearchIcon } from "lucide-react";

// Empty state for the workspace before any search/selection.
export function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
      <SearchIcon className="size-6" />
      <p className="text-sm">No tests selected — search for a customer request or test name above.</p>
    </div>
  );
}
