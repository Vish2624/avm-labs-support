import { cn } from "@/lib/utils";
import type { ProfileTestSummary } from "@/types/profile";

// Tests included in a profile bundle. In "search by test names" mode,
// matchedTestIds highlights which of them the agent actually asked about.
export function ProfileTestList({
  tests,
  matchedTestIds,
}: {
  tests: ProfileTestSummary[];
  matchedTestIds?: Set<string>;
}) {
  if (tests.length === 0) {
    return <p className="text-xs text-muted-foreground">No tests are listed for this profile.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tests.map((test) => {
        const matched = matchedTestIds?.has(test.testId) ?? false;
        return (
          <span
            key={test.testId}
            title={matched ? "Requested" : undefined}
            className={cn(
              "rounded-full px-2.5 py-[3px] text-xs",
              matched ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {matchedTestIds ? (matched ? "✓ " : "+ ") : null}
            {test.officialName}
          </span>
        );
      })}
    </div>
  );
}
