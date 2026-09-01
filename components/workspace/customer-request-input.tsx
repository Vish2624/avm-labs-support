import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Free-text box for pasting the customer's raw WhatsApp message, for the
// agent's own reference while they search by test name below. Purely a
// scratchpad — nothing here drives search or pricing (never guess from
// free text; only real catalog/alias matches surface results).
export function CustomerRequestInput() {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="customer-request">Customer&apos;s message (for reference)</Label>
      <Textarea
        id="customer-request"
        placeholder="Paste the customer's WhatsApp message here…"
        className="min-h-20"
      />
    </div>
  );
}
