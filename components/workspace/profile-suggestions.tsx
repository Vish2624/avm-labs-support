"use client";

import { LayersIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMatchCard } from "./profile-match-card";
import type { ProfileSuggestion } from "@/types/profile";

// Profiles that match the currently-added tests, rendered as a section
// inside the same "Search tests" card (not a separate card) so the whole
// thing reads as one search experience — informational, so the agent knows
// when a bundle price beats pricing tests individually.
export function ProfileSuggestions({
  suggestions,
  loading,
  hasSelection,
}: {
  suggestions: ProfileSuggestion[];
  loading: boolean;
  /** Whether any tests are currently selected — also covers a stale loading/results state left over from before the last test was removed. */
  hasSelection: boolean;
}) {
  if (!hasSelection || (!loading && suggestions.length === 0)) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LayersIcon className="size-3.5" />
        Matches a profile
      </p>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((suggestion) => (
            <ProfileMatchCard key={suggestion.profileId} suggestion={suggestion} />
          ))}
        </div>
      )}
    </div>
  );
}
