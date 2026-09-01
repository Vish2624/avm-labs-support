import { Badge } from "@/components/ui/badge";
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
    <ul className="flex flex-col gap-1">
      {tests.map((test) => (
        <li key={test.testId} className="flex items-center gap-2 text-sm">
          <span>{test.officialName}</span>
          <Badge variant="outline">{test.code}</Badge>
          {matchedTestIds?.has(test.testId) ? <Badge variant="secondary">Requested</Badge> : null}
        </li>
      ))}
    </ul>
  );
}
