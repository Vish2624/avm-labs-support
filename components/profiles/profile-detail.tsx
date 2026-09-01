import { Separator } from "@/components/ui/separator";
import { ProfileTestList } from "./profile-test-list";
import type { ProfileTestSummary } from "@/types/profile";

// Expanded view of one profile: its description and full test roster.
export function ProfileDetail({
  description,
  tests,
  matchedTestIds,
}: {
  description: string | null;
  tests: ProfileTestSummary[];
  matchedTestIds?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <Separator />
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <ProfileTestList tests={tests} matchedTestIds={matchedTestIds} />
    </div>
  );
}
