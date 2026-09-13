"use client";

import { LayersIcon } from "lucide-react";
import { SidebarPortal } from "@/components/layout/sidebar-portal";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMatchCard } from "./profile-match-card";
import type { ProfileSuggestion } from "@/types/profile";

// Profiles that match the currently-added tests. Rendered into the empty
// rail space below the sidebar's nav links (via SidebarPortal) rather than
// as a card in the page content — it's always visible next to the search,
// wherever the agent has scrolled the quote to.
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
    <SidebarPortal>
      <div className="mx-2 my-2 border-t border-sidebar-border" />
      <p className="flex items-center gap-1.5 px-3 pb-1 text-xs font-medium tracking-wide text-sidebar-foreground/50 uppercase">
        <LayersIcon className="size-3.5" />
        Matches a profile
      </p>
      {loading ? (
        <Skeleton className="mx-2 h-16" />
      ) : (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {suggestions.map((suggestion) => (
            <ProfileMatchCard key={suggestion.profileId} suggestion={suggestion} />
          ))}
        </div>
      )}
    </SidebarPortal>
  );
}
