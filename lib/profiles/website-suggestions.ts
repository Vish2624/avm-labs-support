/**
 * The website's profile suggestions for a quote — the same rules as
 * matches() in the website's src/logic/04-navigation-cart.js, so agents
 * suggest exactly what a customer would see online. Pure: no database,
 * every amount an integer in the location currency's minor unit, so
 * comparisons are exact (the website rounds BD decimals for the same reason).
 *
 * A profile qualifies when it replaces something on the quote (tests, or a
 * smaller profile it wholly contains) and either costs less, or adds tests
 * worth more than the difference, for a difference in scale with the quote.
 * Worked out from prices and tests only, never a health judgement.
 *
 * Two additions to the website's rules, so agents can always see where the
 * quoted tests are sold together:
 * - a profile that has every test on the quote and costs the same is a pick
 *   too (one line instead of several; the website skips it as no gain);
 * - every other profile that contains quoted tests follows the picks, with
 *   `pick: false`, those covering the most of the quote first, then cheapest.
 */

// Profile categories for one purpose (school, hair fall, screening): only
// suggested when they cost less. Must match PURPOSE_CATS in the website's src/logic/01-data.js.
const PURPOSE_CATEGORIES = ["kids", "hair", "screening"];

// Which profile categories are about each test category, to rank the
// closest match first. Must match TEST_THEMES in the website's src/logic/01-data.js.
const TEST_THEMES: Record<string, string[]> = {
  routine: ["wellness", "organs"],
  diabetes: ["diabetes"],
  thyroid: ["thyroid"],
  vitamins: ["vitamins"],
  heart: ["heart"],
  hormones: ["women", "men"],
  infections: ["screening"],
  tumour: [],
};

// Tests that can't be booked together, by website id: a profile with one of
// them isn't suggested while another stays on the quote. Must match EXCLUSIVE
// in the website's src/logic/01-data.js.
const EXCLUSIVE_TESTS = [["fbs", "rbs"]];

export interface SuggestionTest {
  id: string;
  /** The test's id on the website, for EXCLUSIVE_TESTS. */
  websiteId?: string;
  /** Minor units; 0 when not offered at this location. */
  price: number;
  categories: string[];
}

export interface SuggestionProfile {
  id: string;
  /** Minor units; 0 when not offered at this location. */
  price: number;
  testIds: string[];
  category: string;
  recommended: boolean;
}

/** The location's country rules from the website, in minor units. */
export interface SuggestionRules {
  minBill: number;
  homeCollectionFreeFrom: number;
}

export interface WebsiteSuggestion {
  profileId: string;
  /** Tests on the quote the profile replaces. */
  replacesTestIds: string[];
  /** Profiles on the quote it wholly contains (replaced too). */
  replacesProfileIds: string[];
  /** Its tests not on the quote yet. */
  extraTestIds: string[];
  /** What the customer pays more (negative: saves), minimum billing counted on both sides. */
  extra: number;
  /** What the extra tests cost one by one. */
  worth: number;
  /** The quote reaches the free home collection limit with this profile. */
  freeHomeCollection: boolean;
  recommended: boolean;
  /** Passes the website's rules (or is the same price for every quoted test); false: only contains quoted tests. */
  pick: boolean;
}

/** profile `a` has every test of profile `b`. */
const covers = (a: SuggestionProfile, b: SuggestionProfile) =>
  a.id !== b.id && b.testIds.length > 0 && b.testIds.every((id) => a.testIds.includes(id));

export function websiteSuggestions({
  quoteTestIds,
  quoteProfileIds,
  tests,
  profiles,
  rules,
}: {
  quoteTestIds: string[];
  quoteProfileIds: string[];
  tests: SuggestionTest[];
  profiles: SuggestionProfile[];
  rules: SuggestionRules;
}): WebsiteSuggestion[] {
  if (quoteTestIds.length === 0 && quoteProfileIds.length === 0) return [];
  const testById = new Map(tests.map((t) => [t.id, t]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const priceOf = (id: string) => testById.get(id)?.price ?? 0;
  const sum = (ids: string[]) => ids.reduce((total, id) => total + priceOf(id), 0);
  const billed = (total: number) => (total > 0 ? Math.max(total, rules.minBill) : 0);

  const inQuote = quoteProfileIds.flatMap((id) => profileById.get(id) ?? []);
  const have = new Set([...quoteTestIds, ...inQuote.flatMap((q) => q.testIds)]);
  const total = sum(quoteTestIds) + inQuote.reduce((t, q) => t + q.price, 0);
  const stretch = Math.max(total * 1.5, rules.homeCollectionFreeFrom);
  // Which EXCLUSIVE_TESTS set each test is in, by its id here.
  const exclusiveSet = new Map(
    tests.flatMap((t) => {
      const i = EXCLUSIVE_TESTS.findIndex((set) => t.websiteId !== undefined && set.includes(t.websiteId));
      return i < 0 ? [] : [[t.id, i] as const];
    })
  );
  // One of `ids` can't be booked with one of `staying`.
  const clashes = (ids: string[], staying: string[]) =>
    ids.some((a) => exclusiveSet.has(a) && staying.some((b) => b !== a && exclusiveSet.get(b) === exclusiveSet.get(a)));
  // A profile on the quote that already has every test of `p`.
  const coveredByQuote = (p: SuggestionProfile) => inQuote.some((q) => covers(q, p));
  // How close a profile is to some tests: about the same thing 1, a general check-up 0.5, anything else 0.25.
  const theme = (p: SuggestionProfile, ts: SuggestionTest[]) =>
    ts.some((t) => t.categories.some((c) => (TEST_THEMES[c] ?? []).includes(p.category)))
      ? 1
      : p.category === "wellness"
        ? 0.5
        : 0.25;

  const out: { suggestion: WebsiteSuggestion; rank: number; value: number }[] = [];
  const rest: { suggestion: WebsiteSuggestion; covered: number }[] = [];
  for (const p of profiles) {
    if (!(p.price > 0) || inQuote.includes(p) || coveredByQuote(p)) continue;
    const ovT = quoteTestIds.filter((id) => p.testIds.includes(id));
    const ovP = inQuote.filter((q) => covers(p, q));
    const kept = inQuote.filter((q) => !ovP.includes(q));
    if (!ovT.length && !ovP.length) continue;
    // Sharing tests with a profile that stays on the quote would charge for them twice.
    if (kept.some((q) => q.testIds.some((id) => p.testIds.includes(id)))) continue;
    // Nor one with a test that can't be booked with what stays on the quote.
    if (clashes(p.testIds, [...quoteTestIds.filter((id) => !ovT.includes(id)), ...kept.flatMap((q) => q.testIds)]))
      continue;
    const others = p.testIds.filter((id) => !have.has(id));
    const replaced = sum(ovT) + ovP.reduce((t, q) => t + q.price, 0);
    const after = total - replaced + p.price;
    const extra = billed(after) - billed(total);
    const worth = sum(others);
    const wholeQuote = ovT.length === quoteTestIds.length && ovP.length === inQuote.length;
    const pick =
      !(extra >= 0 && PURPOSE_CATEGORIES.includes(p.category)) &&
      !(extra > 0 && (worth <= extra || extra > stretch)) &&
      !(extra === 0 && !others.length && !wholeQuote);
    const suggestion: WebsiteSuggestion = {
      profileId: p.id,
      replacesTestIds: ovT,
      replacesProfileIds: ovP.map((q) => q.id),
      extraTestIds: others,
      extra,
      worth,
      freeHomeCollection: total < rules.homeCollectionFreeFrom && after >= rules.homeCollectionFreeFrom,
      recommended: p.recommended,
      pick,
    };
    if (!pick) {
      rest.push({ suggestion, covered: ovT.length + ovP.length });
      continue;
    }
    const covered = [...ovT, ...ovP.flatMap((q) => q.testIds)].flatMap((id) => testById.get(id) ?? []);
    const fit = covered.length / p.testIds.length;
    out.push({
      suggestion,
      rank: extra < 0 ? 0 : extra === 0 ? 1 : 2,
      value: extra > 0 ? (worth / extra) * (0.5 + fit) * (0.5 + theme(p, covered)) : worth - extra,
    });
  }
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.suggestion.recommended) - Number(a.suggestion.recommended) ||
      b.value - a.value ||
      a.suggestion.extra - b.suggestion.extra
  );
  rest.sort((a, b) => b.covered - a.covered || a.suggestion.extra - b.suggestion.extra);
  return [...out, ...rest].map((entry) => entry.suggestion);
}
