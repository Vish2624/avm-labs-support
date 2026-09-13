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
    <div className="flex flex-wrap gap-2">
      {tests.map((test) => (
        <span
          key={test.testId}
          title={matchedTestIds?.has(test.testId) ? "Requested" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px]",
            matchedTestIds?.has(test.testId)
              ? "bg-accent text-accent-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {test.officialName}
        </span>
      ))}
    </div>
  );
}
