import { cn } from "@/lib/utils";
import { AVAILABILITY_LABELS, type AvailabilityStatus } from "@/lib/constants/availability";

const PILL_CLASSNAME: Record<AvailabilityStatus, string> = {
  available: "bg-success/15 text-success-foreground",
  temporarily_unavailable: "bg-warning/25 text-warning-foreground",
  unavailable: "bg-destructive/10 text-destructive",
};

// Small rounded availability tag used on result rows and package cards.
export function AvailabilityPill({ status, className }: { status: AvailabilityStatus; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-px text-[11.5px] font-medium whitespace-nowrap",
        PILL_CLASSNAME[status],
        className
      )}
    >
      {AVAILABILITY_LABELS[status]}
    </span>
  );
}
