"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import { ProfileDetail } from "./profile-detail";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";

// Single profile result — works for both "search by name" (ProfileSearchResult,
// no match info) and "search by test names" (ProfileSuggestion, ranked by
// overlap) modes. Expands in place to show the profile's full test roster.
export function ProfileResultCard({
  result,
  index = 0,
}: {
  result: ProfileSuggestion | ProfileSearchResult;
  /** Position in the list — staggers the cards' entrance. */
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const match = "matchedCount" in result ? result : null;

  return (
    <div
      className="rounded-[14px] border border-transparent px-4 py-3.5 avm-row-in transition-[background,border-color,transform,translate,scale,rotate,box-shadow] duration-300 hover:-translate-y-px hover:border-border hover:bg-card hover:shadow-elevated"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{result.name}</span>
            <Badge variant={AVAILABILITY_BADGE_VARIANT[result.availability]}>
              {AVAILABILITY_LABELS[result.availability]}
            </Badge>
            {match ? <Badge variant="secondary">covers {match.matchPercentage}%</Badge> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3.5 text-[13.5px] text-muted-foreground">
            {"includedTest" in result && result.includedTest ? (
              <span>
                Includes <span className="font-medium text-foreground">{result.includedTest.officialName}</span>
              </span>
            ) : null}
            <span>{result.tests.length} test{result.tests.length === 1 ? "" : "s"} included</span>
            <span>ready in {formatTat(result.tatText)}</span>
          </div>
        </div>
        <span className="text-[15.5px] font-semibold text-primary tabular-nums">{formatCurrency(result.price)}</span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-[10px] bg-primary/10 px-4 py-2.5 text-[13.5px] font-medium text-primary transition-[background,color,transform,translate,scale,rotate] duration-200 hover:scale-[1.03] hover:bg-primary hover:text-primary-foreground active:scale-95"
        >
          {expanded ? "Hide tests" : "See tests"}
        </button>
      </div>
      {match ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Covers {match.matchedCount} of your {match.requestedCount} requested test
          {match.requestedCount === 1 ? "" : "s"} · {match.profileTestCount} tests in the package
        </p>
      ) : null}
      {expanded ? (
        <ProfileDetail
          description={result.description}
          tests={result.tests}
          matchedTestIds={
            match
              ? new Set(match.matchedTestIds)
              : "includedTest" in result && result.includedTest
                ? new Set([result.includedTest.testId])
                : undefined
          }
        />
      ) : null}
    </div>
  );
}
