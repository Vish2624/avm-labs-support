"use client";

import { LayersIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMatchCard } from "./profile-match-card";
import type { ProfileSuggestion } from "@/types/profile";

// Profiles that match the currently selected tests — informational, so the
// agent knows when a bundle price beats pricing tests individually.
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
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground">
            <LayersIcon className="size-3.5" />
          </span>
          Matching profiles
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          suggestions.map((suggestion) => (
            <ProfileMatchCard key={suggestion.profileId} suggestion={suggestion} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
