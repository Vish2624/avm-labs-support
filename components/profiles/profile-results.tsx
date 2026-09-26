"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ProfileResultCard } from "./profile-result-card";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";

// Ranked list of matching profiles, with loading/empty/error states.
export function ProfileResults({
  hasQuery,
  results,
  loading,
  error,
  emptyMessage,
}: {
  /** Whether there's currently a name query or at least one resolved test id — false means nothing has been searched yet. */
  hasQuery: boolean;
  results: (ProfileSuggestion | ProfileSearchResult)[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
}) {
  if (!hasQuery) return null;

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (results.length === 0) {
    return <p className="py-11 text-center text-[15px] text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {results.map((result, index) => (
        <ProfileResultCard key={result.profileId} result={result} index={index} />
      ))}
    </div>
  );
}
