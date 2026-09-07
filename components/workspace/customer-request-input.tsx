import { ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// Free-text box for pasting the customer's raw WhatsApp message, for the
// agent's own reference while they search by test name below. Purely a
// scratchpad — nothing here drives search or pricing (never guess from
// free text; only real catalog/alias matches surface results). Collapsible
// so agents who don't use it can keep search at the top.
export function CustomerRequestInput() {
  return (
    <details open className="group rounded-2xl border border-border bg-card px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        Customer&apos;s message (for reference)
      </summary>
      <Textarea
        id="customer-request"
        placeholder="Paste the customer's WhatsApp message here…"
        className="mt-2 min-h-20 rounded-xl"
      />
    </details>
  );
}
