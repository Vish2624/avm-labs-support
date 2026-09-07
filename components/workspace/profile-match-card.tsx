import { LayersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { ProfileSuggestion } from "@/types/profile";

// Single profile suggestion with match percentage.
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
          <Badge variant="secondary">{suggestion.matchPercentage}% match</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Covers {suggestion.matchedCount} of your {suggestion.requestedCount} selected test
          {suggestion.requestedCount === 1 ? "" : "s"} ({suggestion.profileTestCount} tests in bundle)
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{formatCurrency(suggestion.price)}</span>
          <span>TAT: {formatTat(suggestion.tatText)}</span>
          <span>{AVAILABILITY_LABELS[suggestion.availability]}</span>
        </div>
      </div>
    </div>
  );
}
