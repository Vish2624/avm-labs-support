import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { ProfileSuggestion } from "@/types/profile";

// Single profile match, sized for the narrow sidebar rail — compact,
// stacked rows rather than the wide search-result layout.
export function ProfileMatchCard({ suggestion }: { suggestion: ProfileSuggestion }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-tight font-medium text-sidebar-foreground">{suggestion.name}</span>
        <Badge variant="secondary" className="shrink-0 text-[0.65rem]">
          {suggestion.matchPercentage}%
        </Badge>
      </div>
      <p className="text-xs text-sidebar-foreground/60">
        Covers {suggestion.matchedCount}/{suggestion.requestedCount} selected
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-sidebar-foreground/70">
        <span className="font-semibold text-sidebar-foreground tabular-nums">
          {formatCurrency(suggestion.price)}
        </span>
        <span>{formatTat(suggestion.tatText)}</span>
      </div>
      <span className="text-[0.7rem] text-sidebar-foreground/50">{AVAILABILITY_LABELS[suggestion.availability]}</span>
    </div>
  );
}
