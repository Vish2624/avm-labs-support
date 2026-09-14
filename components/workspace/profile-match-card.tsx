import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import type { ProfileSuggestion } from "@/types/profile";

// Single profile match, shown inside the quotation panel — a package that
// covers some or all of the currently-selected tests.
export function ProfileMatchCard({ suggestion }: { suggestion: ProfileSuggestion }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-success/10 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-tight font-semibold">{suggestion.name}</span>
        <Badge variant="secondary" className="shrink-0">
          {suggestion.matchPercentage}% match
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Covers {suggestion.matchedCount} of your {suggestion.requestedCount} requested test
        {suggestion.requestedCount === 1 ? "" : "s"} · {suggestion.profileTestCount} tests in the package
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base font-semibold tabular-nums">{formatCurrency(suggestion.price)}</span>
        <span className="text-xs text-muted-foreground">ready in {formatTat(suggestion.tatText)}</span>
        {suggestion.availability !== "available" ? (
          <Badge variant={AVAILABILITY_BADGE_VARIANT[suggestion.availability]}>
            {AVAILABILITY_LABELS[suggestion.availability]}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
