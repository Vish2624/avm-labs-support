"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AvailabilityPill } from "./availability-pill";
import { AddToggleButton } from "./test-result-card";
import { ProfileTestList } from "@/components/profiles/profile-test-list";
import type { ProfileSearchResult } from "@/types/profile";

// A package (profile) matched by name — or by containing the searched
// test/parameter — in the Quote search. Adding it puts
// the package itself on the quote at its fixed bundle price.
export function PackageResultRow({
  result,
  added,
  onAdd,
  onRemove,
}: {
  result: ProfileSearchResult;
  added: boolean;
  onAdd: (result: ProfileSearchResult) => void;
  onRemove: (profileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        // Bordered and lightly tinted so packages read as distinct from the
        // plain test rows listed above them.
        "relative rounded-[14px] border border-primary/20 bg-primary/[0.03] px-3 py-3 avm-row-in transition-[background,border-color,transform,translate,scale,rotate,box-shadow] duration-300 hover:-translate-y-px hover:border-primary/35 hover:bg-primary/[0.06] hover:shadow-elevated dark:border-primary/25 dark:bg-primary/[0.06]",
        result.availability === "unavailable" && "opacity-60"
      )}
    >
      {added ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[14px] avm-flash" /> : null}
      <div className="relative flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium">{result.name}</span>
            <span className="rounded-[5px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
              PACKAGE
            </span>
          </div>
          {result.includedTest ? (
            <span className="text-[12.5px] text-muted-foreground">
              Includes <span className="font-medium text-foreground">{result.includedTest.officialName}</span>
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="whitespace-nowrap underline-offset-2 hover:text-foreground hover:underline"
            >
              {result.tests.length} test{result.tests.length === 1 ? "" : "s"} {expanded ? "▴" : "▾"}
            </button>
            <span className="whitespace-nowrap">Ready in {formatTat(result.tatText)}</span>
            <AvailabilityPill status={result.availability} />
          </div>
        </div>
        <span className={cn(
          "shrink-0 text-[15px] font-semibold whitespace-nowrap tabular-nums",
          // In-house prices in blue, outsourced in red.
          result.serviceType === "outsource" ? "text-[oklch(0.55_0.2_25)] dark:text-[oklch(0.72_0.17_25)]" : "text-primary"
        )}>
          {formatCurrency(result.price)}
        </span>
        <AddToggleButton
          added={added}
          label={result.name}
          onAdd={() => onAdd(result)}
          onRemove={() => onRemove(result.profileId)}
        />
      </div>
      {expanded ? (
        <div className="mt-2.5">
          <ProfileTestList tests={result.tests} />
        </div>
      ) : null}
    </div>
  );
}
