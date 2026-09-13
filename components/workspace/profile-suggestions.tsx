"use client";

import { LayersIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMatchCard } from "./profile-match-card";
import type { ProfileSuggestion } from "@/types/profile";

// Profiles that match the currently-added tests. Rendered inline in the
// quotation panel (see quotation-panel.tsx), below the selected tests —
// the icon rail has no room for a sidebar section of its own.
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
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <LayersIcon className="size-3.5" />
        Cheaper as a package
      </p>
      {loading ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
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
