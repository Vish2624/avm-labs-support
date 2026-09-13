import { LayersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import type { ProfileSuggestion } from "@/types/profile";

// Single profile match row — same layout as TestResultCard (icon, name +
// badges, price/TAT/availability row) so it reads as part of the same
// search UI, just without an add action (profiles are informational only).
export function ProfileMatchCard({ suggestion }: { suggestion: ProfileSuggestion }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <LayersIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{suggestion.name}</span>
          <Badge variant="outline">{suggestion.code}</Badge>
          <span className="text-xs text-muted-foreground">
            covers {suggestion.matchedCount} of {suggestion.requestedCount} selected
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(suggestion.price)}
          </span>
          <span>TAT: {formatTat(suggestion.tatText)}</span>
          <Badge variant={AVAILABILITY_BADGE_VARIANT[suggestion.availability]}>
            {AVAILABILITY_LABELS[suggestion.availability]}
          </Badge>
          <Badge variant="secondary">{suggestion.matchPercentage}% match</Badge>
        </div>
      </div>
    </div>
  );
}
