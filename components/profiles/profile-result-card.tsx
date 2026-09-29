"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useQuote } from "@/components/workspace/quote/quote-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_BADGE_VARIANT } from "@/lib/constants/availability";
import { ProfileDetail } from "./profile-detail";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";

/** Shared with the quote's own "Switched to …" toast, so adding shows one pop-up, not two. */
const PACKAGE_TOAST_ID = "quote-package";

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
  // The quote is shared with the Quote Builder, so a package found here
  // goes straight onto it — no searching for it again over there.
  const router = useRouter();
  const { lineItems, applyPackage } = useQuote();
  const added = lineItems.some((line) => line.kind === "package" && line.profileId === result.profileId);
  function addToQuote() {
    applyPackage({
      kind: "package",
      profileId: result.profileId,
      code: result.code,
      name: result.name,
      tests: result.tests,
      price: result.price,
      tatText: result.tatText,
      serviceType: result.serviceType,
      availability: result.availability,
    });
    toast.success(`${result.name} added to the quote`, {
      id: PACKAGE_TOAST_ID,
      action: { label: "Open quote", onClick: () => router.push("/workspace") },
    });
  }

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            {expanded ? "Hide tests" : "See tests"}
          </button>
          {added ? (
            <span className="rounded-[10px] bg-success/15 px-4 py-2.5 text-[13.5px] font-medium text-success-foreground avm-check">
              Added ✓
            </span>
          ) : (
            <button
              type="button"
              onClick={addToQuote}
              className="rounded-[10px] bg-primary/10 px-4 py-2.5 text-[13.5px] font-medium text-primary transition-[background,color,transform,translate,scale,rotate] duration-200 hover:scale-[1.03] hover:bg-primary hover:text-primary-foreground active:scale-95"
            >
              + Add to quote
            </button>
          )}
        </div>
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
