import { ReceiptText } from "lucide-react";

// Empty state for the quotation column before any test is added.
export function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-glass p-10 text-center backdrop-blur-xl">
      <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <ReceiptText className="size-5" />
      </span>
      <p className="text-sm font-medium">No tests in the quotation yet</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Search for a test or alias on the left and add it. The running total and the
        WhatsApp reply build here automatically.
      </p>
    </div>
  );
}
