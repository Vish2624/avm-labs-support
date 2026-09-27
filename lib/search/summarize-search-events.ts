import type { TestAlias } from "@/types/test";
import type { MisrankedSearch, MissedSearch, SearchEvent, SearchLearningSummary } from "@/types/search";

const compact = (value: string) => value.replace(/\s+/g, "");

/**
 * Turns the raw search log into the Admin > Missed searches review lists.
 * Pure — no DB access.
 *
 * - Missed: every zero-result search, grouped by normalized query. The
 *   suggested test is the one agents most often picked right after it
 *   (previousMissQuery) or picked from the AI list for it.
 * - Misranked: tests agents picked from below the top result (or from the
 *   AI list while rule-based results were showing), grouped by query + test.
 *
 * Anything an existing alias already covers is left out, so creating the
 * alias is what clears an entry from the list.
 */
export function summarizeSearchEvents(events: SearchEvent[], aliases: TestAlias[]): SearchLearningSummary {
  const aliasQueries = new Set(aliases.map((alias) => compact(alias.normalizedAlias)));
  const aliasPairs = new Set(aliases.map((alias) => `${compact(alias.normalizedAlias)}|${alias.testId}`));

  // Newest first, so the first wording seen per group is the most recent one.
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const missed = new Map<string, MissedSearch & { votes: Map<string, number> }>();
  const vote = (normalizedQuery: string, testId: string) => {
    const group = missed.get(normalizedQuery);
    if (group) group.votes.set(testId, (group.votes.get(testId) ?? 0) + 1);
  };

  for (const event of sorted) {
    if (event.resultCount !== 0 || aliasQueries.has(compact(event.normalizedQuery))) continue;
    const group = missed.get(event.normalizedQuery);
    if (group) {
      group.count += 1;
    } else {
      missed.set(event.normalizedQuery, {
        normalizedQuery: event.normalizedQuery,
        query: event.query,
        count: 1,
        lastSeenAt: event.createdAt,
        suggestedTestId: null,
        suggestedCount: 0,
        votes: new Map(),
      });
    }
  }
  for (const event of sorted) {
    if (!event.pickedTestId) continue;
    if (event.previousMissQuery) vote(event.previousMissQuery, event.pickedTestId);
    // Zero rule-based results, picked from the AI list: the miss and its answer in one row.
    if (event.resultCount === 0) vote(event.normalizedQuery, event.pickedTestId);
  }

  const misranked = new Map<string, MisrankedSearch>();
  const picksPerQuery = new Map<string, number>();
  for (const event of sorted) {
    if (!event.pickedTestId) continue;
    picksPerQuery.set(event.normalizedQuery, (picksPerQuery.get(event.normalizedQuery) ?? 0) + 1);
    const belowTop = event.resultCount > 0 && (event.pickedRank === null || event.pickedRank > 1);
    if (!belowTop || aliasPairs.has(`${compact(event.normalizedQuery)}|${event.pickedTestId}`)) continue;

    const key = `${event.normalizedQuery}|${event.pickedTestId}`;
    const group = misranked.get(key);
    if (group) {
      group.count += 1;
    } else {
      misranked.set(key, {
        normalizedQuery: event.normalizedQuery,
        query: event.query,
        testId: event.pickedTestId,
        count: 1,
        totalPicks: 0,
        lastSeenAt: event.createdAt,
      });
    }
  }

  const byFrequency = <T extends { count: number; lastSeenAt: string }>(a: T, b: T) =>
    b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt);

  return {
    missed: [...missed.values()]
      .map(({ votes, ...group }) => {
        const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
        return best ? { ...group, suggestedTestId: best[0], suggestedCount: best[1] } : group;
      })
      .sort(byFrequency),
    misranked: [...misranked.values()]
      .map((group) => ({ ...group, totalPicks: picksPerQuery.get(group.normalizedQuery) ?? group.count }))
      .sort(byFrequency),
  };
}
