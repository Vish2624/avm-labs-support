import "server-only";
import { getTestsByIds } from "@/lib/database/tests";
import type { ProfileTestSummary } from "@/types/profile";

/**
 * Looks up code/officialName for a set of profiles' component test ids in
 * one batch query — the "included tests" roster on a profile result (see
 * ProfileTestList). Shared by findMatchingProfiles() and
 * searchProfilesByName() so neither re-fetches the same tests separately.
 */
export async function hydrateProfileTests(
  testIdsByProfileId: Map<string, string[]>
): Promise<Map<string, ProfileTestSummary[]>> {
  const allTestIds = [...new Set([...testIdsByProfileId.values()].flat())];
  const tests = await getTestsByIds(allTestIds);
  const testById = new Map(tests.map((test) => [test.id, test]));

  const summariesByProfileId = new Map<string, ProfileTestSummary[]>();
  for (const [profileId, testIds] of testIdsByProfileId) {
    const summaries = testIds
      .map((id) => testById.get(id))
      .filter((test): test is NonNullable<typeof test> => Boolean(test))
      .map((test) => ({ testId: test.id, code: test.code, officialName: test.officialName }));
    summariesByProfileId.set(profileId, summaries);
  }
  return summariesByProfileId;
}
