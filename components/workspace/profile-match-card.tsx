import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import type { ProfileSuggestion } from "@/types/profile";

// Single profile match, shown inside the quotation panel — a package that
// covers some or all of the currently-selected tests.
export function ProfileMatchCard({ suggestion }: { suggestion: ProfileSuggestion }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] leading-tight font-semibold">{suggestion.name}</span>
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10.5px]">
            {suggestion.matchPercentage}% match
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          Covers {suggestion.matchedCount}/{suggestion.requestedCount} requested ·{" "}
          {suggestion.profileTestCount} tests · ready in {formatTat(suggestion.tatText)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(suggestion.price)}</span>
        {suggestion.availability !== "available" ? (
          <Badge variant={AVAILABILITY_BADGE_VARIANT[suggestion.availability]} className="px-1.5 py-0 text-[10.5px]">
            {AVAILABILITY_LABELS[suggestion.availability]}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
