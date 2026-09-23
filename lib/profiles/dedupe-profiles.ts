import { normalizeQuery } from "@/lib/search/normalize-query";

/**
 * The profiles catalog holds some packages twice under the same name: an
 * early entry whose code is just its name ("WOMEN HORMONE PROFILE") and a
 * later VSoft import with the real code. Both are priced, so without this
 * the agent sees the same package listed twice.
 *
 * Keeps one result per normalized name, at the position of its first
 * (best-ranked) occurrence, preferring the entry with a real code — a
 * code that differs from the name — over a name-as-code placeholder.
 * Pure — no DB access.
 */
export function dedupeProfilesByName<T extends { code: string; name: string }>(results: T[]): T[] {
  const hasRealCode = (result: T) => normalizeQuery(result.code) !== normalizeQuery(result.name);
  const keptByName = new Map<string, number>();
  const kept: T[] = [];

  for (const result of results) {
    const key = normalizeQuery(result.name);
    const index = keptByName.get(key);
    if (index === undefined) {
      keptByName.set(key, kept.length);
      kept.push(result);
    } else if (!hasRealCode(kept[index]) && hasRealCode(result)) {
      kept[index] = result;
    }
  }
  return kept;
}
