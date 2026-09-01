"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { ProfileDetail } from "./profile-detail";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";

// Single profile result — works for both "search by name" (ProfileSearchResult,
// no match info) and "search by test names" (ProfileSuggestion, ranked by
// overlap) modes. Expands in place to show the profile's full test roster.
export function ProfileResultCard({ result }: { result: ProfileSuggestion | ProfileSearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const match = "matchedCount" in result ? result : null;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{result.name}</span>
            <Badge variant="outline">{result.code}</Badge>
            {match ? <Badge variant="secondary">{match.matchPercentage}% match</Badge> : null}
          </div>
          {match ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Covers {match.matchedCount} of your {match.requestedCount} requested test
              {match.requestedCount === 1 ? "" : "s"} ({match.profileTestCount} tests in bundle)
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{formatCurrency(result.price)}</span>
            <span>TAT: {formatTat(result.tatText)}</span>
            <span>{AVAILABILITY_LABELS[result.availability]}</span>
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? (
            <>
              <ChevronUpIcon /> Hide tests
            </>
          ) : (
            <>
              <ChevronDownIcon /> {result.tests.length} test{result.tests.length === 1 ? "" : "s"}
            </>
          )}
        </Button>
      </div>
      {expanded ? (
        <ProfileDetail
          description={result.description}
          tests={result.tests}
          matchedTestIds={match ? new Set(match.matchedTestIds) : undefined}
        />
      ) : null}
    </div>
  );
}
