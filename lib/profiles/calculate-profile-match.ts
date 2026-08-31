/**
 * Ranks profiles by how many of the requested tests they contain.
 * Pure algorithm over ids — no database access, no business data.
 * Used by both /profiles ("search by test names") and the Support
 * Workspace's profile-suggestions panel.
 */

export interface ProfileMatchInput {
  profileId: string;
  profileTestIds: string[];
}

export interface ProfileMatchResult {
  profileId: string;
  matchedTestIds: string[];
  matchedCount: number;
  requestedCount: number;
  profileTestCount: number;
  /** matchedCount / requestedCount, 0-100. */
  matchPercentage: number;
}

export function calculateProfileMatch(
  requestedTestIds: string[],
  profile: ProfileMatchInput
): ProfileMatchResult {
  const requestedSet = new Set(requestedTestIds);
  const matchedTestIds = profile.profileTestIds.filter((id) => requestedSet.has(id));
  const requestedCount = requestedTestIds.length;

  return {
    profileId: profile.profileId,
    matchedTestIds,
    matchedCount: matchedTestIds.length,
    requestedCount,
    profileTestCount: profile.profileTestIds.length,
    matchPercentage:
      requestedCount === 0 ? 0 : Math.round((matchedTestIds.length / requestedCount) * 100),
  };
}

/**
 * Ranks: most matched tests first, then highest match percentage, then the
 * more specific (fewer extra tests) profile first on ties.
 */
export function rankProfileMatches(results: ProfileMatchResult[]): ProfileMatchResult[] {
  return [...results].sort((a, b) => {
    if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
    if (b.matchPercentage !== a.matchPercentage) return b.matchPercentage - a.matchPercentage;
    return a.profileTestCount - b.profileTestCount;
  });
}
