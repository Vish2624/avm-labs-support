import "server-only";
import { normalizeQuery } from "@/lib/search/matching/normalize-query";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { sumMoney } from "@/lib/pricing/money";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { buildSearchCandidates } from "@/lib/search/matching/build-search-candidates";
import { rankResults } from "@/lib/search/matching/rank-results";
import { correctSpelling } from "./spell-correct";
import { resolveNamedItems, testNameIn } from "./test-question";
import { findPriced, suggestionKey, toSuggestion, type PricedCatalog, type PricedItem } from "./priced-catalog";
import { customerName } from "./customer-labels";
import type { AiAnswer, AiSuggestion, FastingInfo } from "@/types/ai-assistant";

/**
 * Several tests named in one question — "fasting for cbc, tsh, vit d and
 * hba1c?", "which profile has lipid, lft, kft". Split on list separators
 * first (commas, new lines, ";", "+", "&", ":"), so each name is read on its
 * own; a piece without separators ("tsh t3 t4") is split word by word by
 * resolveNamedItems.
 */
const LIST_SEPARATORS = /[,;\n:|+&]+|\band\b/i;
/** A loose name ("vitamin d" for "25-OH Vitamin D (Total)") counts when its best fuzzy match scores this well (0-100)… */
const FUZZY_MIN_SCORE = 85;
/** …and beats the runner-up by this much ("sugar" ties three tests — too unclear to pick one). */
const FUZZY_MIN_LEAD = 2;
/** "1. cbc", "2) tsh", "- vit d", "• hba1c" */
const LIST_MARKER = /^\s*(\d+\s*[.)-]|[-*•])\s*/;
/** Most items one question can name. */
const MAX_GROUP_ITEMS = 30;
/** An unrecognised piece longer than this is prose ("can you check for me"), not a test name. */
const MAX_NAME_WORDS = 4;

// Words that only frame the request ("give me the cheapest profile which
// has these tests"), dropped before a piece is matched to a test.
const INSTRUCTION_WORDS = new Set([
  "these", "those", "following", "below", "above", "one", "ones", "cheapest", "cheaper", "cheap", "best", "exact",
  "exactly", "match", "matches", "matching", "individually", "individual", "each", "separately", "per", "every",
  "give", "find", "suggest", "recommend", "provide", "single", "both", "having", "has", "contain", "contains",
  "containing", "covering", "cover", "covers", "profiles", "packages", "panels", "includes", "including", "include",
  "where", "whether", "or", "not", "required", "see", "let", "please", "kindly", "whole", "lowest", "low", "price",
]);
const PACKAGE_WORD = /^(profile|package|panel|pack)$/;

/** A piece's test name with framing words gone, and a leading "profile" ("profile cbc") dropped — "lipid profile" keeps its own. */
function cleanName(name: string): string {
  const words = name.split(" ").filter((word) => word && !INSTRUCTION_WORDS.has(word));
  while (words.length > 0 && PACKAGE_WORD.test(words[0])) words.shift();
  return words.join(" ");
}

export interface TestGroup {
  /** Every named test/package found in our list, in the order asked, without duplicates. */
  items: PricedItem[];
  /** Names that look like tests but aren't in our list at this location. */
  notFound: string[];
}

/** The tests a list question names. Only meaningful when it names two or more. */
export async function resolveTestGroup(rawQuestion: string, catalog: PricedCatalog): Promise<TestGroup> {
  const pieces = rawQuestion
    .split(LIST_SEPARATORS)
    .map((piece) => piece.replace(LIST_MARKER, "").trim())
    .filter(Boolean);

  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const testById = new Map(tests.map((test) => [test.id, test]));
  // The clear best fuzzy match for a name with no exact one, priced here.
  const closest = (name: string): PricedItem | undefined => {
    const [top, next] = rankResults(buildSearchCandidates(name, tests, aliases));
    if (!top || top.score < FUZZY_MIN_SCORE || (next && top.score - next.score < FUZZY_MIN_LEAD)) return undefined;
    const test = testById.get(top.testId);
    return test ? findPriced(catalog, test.code) : undefined;
  };

  const found = new Map<string, PricedItem>();
  const notFound: string[] = [];
  for (const piece of pieces) {
    const name = cleanName(testNameIn(await correctSpelling(piece, catalog)));
    if (!name) continue;
    let items = await resolveNamedItems(name, catalog, false, MAX_GROUP_ITEMS);
    if (items.length === 0) {
      const loose = closest(name);
      if (loose) items = [loose];
    }
    if (items.length === 0) {
      if (name.split(" ").length <= MAX_NAME_WORDS) notFound.push(piece.replace(/\?+$/, "").trim());
      continue;
    }
    for (const item of items) {
      if (found.size < MAX_GROUP_ITEMS && !found.has(suggestionKey(item))) found.set(suggestionKey(item), item);
    }
  }
  return { items: [...found.values()], notFound };
}

/** Asking for a profile/package that holds the named tests. */
const PROFILE_ASK = /\b(profiles?|packages?|panels?)\b/;

export function asksForProfile(question: string, group: TestGroup): boolean {
  // "profile" must be asked for, not just part of a named package's own
  // name ("price of lipid profile, cbc").
  let asked = ` ${normalizeQuery(question)} `;
  for (const item of group.items) {
    if (item.kind === "package") asked = asked.replaceAll(` ${normalizeQuery(item.name)} `, " ");
  }
  // A question about packages only ("what's in lipid profile and kft") is
  // about their contents, not about finding one.
  return PROFILE_ASK.test(asked) && group.items.some((item) => item.kind === "test") && requestedTests(group).length >= 2;
}

interface RequestedTest {
  testId: string;
  code: string;
  name: string;
}

/** The individual tests asked for — a named package counts as its own tests. */
function requestedTests(group: TestGroup): RequestedTest[] {
  const byId = new Map<string, RequestedTest>();
  for (const item of group.items) {
    const tests =
      item.kind === "test"
        ? [{ testId: item.testId, code: item.code, name: item.name }]
        : item.tests.map((test) => ({ testId: test.testId, code: test.code, name: test.officialName }));
    for (const test of tests) if (!byId.has(test.testId)) byId.set(test.testId, test);
  }
  return [...byId.values()];
}

type PackageItem = Extract<PricedItem, { kind: "package" }>;

interface ProfileOption {
  profile: PackageItem;
  covered: RequestedTest[];
  missing: RequestedTest[];
  /** The tests it holds that weren't asked for. */
  extras: number;
  /** The profile plus each missing test bought on its own (missing tests not sold alone are left out). */
  total: number;
}

const notFoundLine = (names: string[]) =>
  names.length > 0
    ? `Couldn't match to one test in our list: ${names.join(", ")} — try the exact test name, or check with the lab team.`
    : null;

/** "both" / "all 5" — as in "includes both tests". */
const allOf = (count: number) => (count === 2 ? "both" : `all ${count}`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const priceTat = (item: { price: PricedItem["price"]; tatText: string }) =>
  `${formatCurrency(item.price)}, report in ${formatTat(item.tatText)}`;

/**
 * "Give me a profile with CBC, TSH, Vit D and HbA1c": every priced profile
 * and package is checked against the requested tests.
 *  - Profiles holding all of them: the cheapest, and the exact match (no
 *    extra tests) when that's a different one.
 *  - None holds all: the best partial options (most tests covered, then the
 *    lowest cost once the missing tests are added on their own), naming the
 *    tests not included and pricing them separately.
 *  - None holds even two: the tests priced individually.
 * Prices, report times and rosters come only from our records.
 */
export function findProfilesFor(
  group: TestGroup,
  catalog: PricedCatalog
): { answer: AiAnswer; reply: string; results: AiSuggestion[]; topic: string } {
  const requested = requestedTests(group);
  const requestedIds = new Set(requested.map((test) => test.testId));
  const single = (test: RequestedTest) => findPriced(catalog, test.code);
  const singleTests = requested.map((test) => ({ test, priced: single(test) }));
  const currency = catalog.items[0]?.price.currency ?? "AED";

  const options: ProfileOption[] = catalog.items
    .filter((item): item is PackageItem => item.kind === "package")
    .map((profile) => {
      const inside = new Set(profile.tests.map((test) => test.testId));
      const covered = requested.filter((test) => inside.has(test.testId));
      const missing = requested.filter((test) => !inside.has(test.testId));
      const missingPrices = missing.flatMap((test) => {
        const priced = single(test);
        return priced ? [priced.price] : [];
      });
      return {
        profile,
        covered,
        missing,
        extras: profile.tests.filter((test) => !requestedIds.has(test.testId)).length,
        total: sumMoney([profile.price, ...missingPrices], profile.price.currency).amount,
      };
    })
    .filter((option) => option.covered.length > 0);

  const individualPrices = singleTests.flatMap(({ priced }) => (priced ? [priced.price] : []));
  const individualTotal = individualPrices.length > 0 ? sumMoney(individualPrices, currency) : null;
  const allSoldAlone = individualPrices.length === requested.length;
  const individuallyLine =
    individualTotal && allSoldAlone
      ? `${capitalize(allOf(requested.length))} tests booked individually: ${formatCurrency(individualTotal)}`
      : null;

  const results: AiSuggestion[] = [];
  const addProfile = (option: ProfileOption, reason: string) =>
    results.push(toSuggestion(option.profile, { score: 1 - results.length * 0.01, level: "high", reason }));
  const addTest = (item: PricedItem, reason: string) => {
    if (results.some((existing) => existing.code === item.code)) return;
    results.push(toSuggestion(item, { score: 0.9 - results.length * 0.01, level: "high", reason }));
  };
  const topic = requested.map((test) => test.name).join(", ");
  const notFound = notFoundLine(group.notFound);

  const full = options
    .filter((option) => option.missing.length === 0)
    .sort((a, b) => a.profile.price.amount - b.profile.price.amount || a.extras - b.extras);
  if (full.length > 0) {
    const cheapest = full[0];
    const exact = full.filter((option) => option.extras === 0).sort((a, b) => a.profile.price.amount - b.profile.price.amount)[0];
    const picks = exact && exact !== cheapest ? [cheapest, exact] : [cheapest];
    const lines = picks.map((option) => {
      const label = option === exact ? (picks.length > 1 ? "Exact match" : "Exact match · cheapest") : "Cheapest";
      const extra = option.extras > 0 ? ` (+${option.extras} more test${option.extras === 1 ? "" : "s"})` : " (only these tests)";
      addProfile(option, `${label} — includes ${allOf(requested.length)} tests${extra}`);
      return `• ${label}: ${customerName(option.profile)} – ${priceTat(option.profile)}${extra}`;
    });
    // Bought one by one may still be cheaper than any profile holding them.
    const cheaperAlone = individualTotal && allSoldAlone && individualTotal.amount < cheapest.profile.price.amount;
    if (cheaperAlone) {
      for (const { priced } of singleTests) {
        if (priced) results.push(toSuggestion(priced, { score: 0.5, level: "medium", reason: "Individually — cheaper than the profile" }));
      }
    }
    const text = [
      `${full.length === 1 ? "1 profile includes" : `${full.length} profiles include`} ${allOf(requested.length)} tests (${topic}).`,
      ...lines,
      individuallyLine ? `${individuallyLine}${cheaperAlone ? " — cheaper than the profile" : ""}` : null,
      notFound,
    ]
      .filter(Boolean)
      .join("\n");
    const reply = [
      `Hi! ${picks.length > 1 ? "These packages include" : "This package includes"} all the tests you asked for:`,
      "",
      ...picks.map((option) => `• ${customerName(option.profile)} – ${priceTat(option.profile)}`),
      ...(cheaperAlone
        ? [
            "",
            `If you only need these ${requested.length} tests, booking them individually is cheaper:`,
            "",
            ...singleTests.flatMap(({ priced }) => (priced ? [`• ${customerName(priced)} – ${priceTat(priced)}`] : [])),
            "",
            `Total: ${formatCurrency(individualTotal)}`,
          ]
        : []),
      ...(notFound ? ["", `We couldn't find: ${group.notFound.join(", ")}.`] : []),
    ].join("\n");
    return { answer: { subject: "profile_match", verdict: "yes", text }, reply, results, topic };
  }

  // No profile has everything: best partial options — at least two of the
  // requested tests, most covered first, then cheapest overall.
  const partial = options
    .filter((option) => option.covered.length >= 2)
    .sort((a, b) => b.covered.length - a.covered.length || a.total - b.total);
  const picks: ProfileOption[] = [];
  if (partial[0]) picks.push(partial[0]);
  const cheapestOverall = [...partial].sort((a, b) => a.total - b.total)[0];
  if (cheapestOverall && cheapestOverall !== partial[0]) picks.push(cheapestOverall);

  const missingLines = (option: ProfileOption) =>
    option.missing.map((test) => {
      const priced = single(test);
      if (priced) addTest(priced, `Not in ${option.profile.name} — book separately`);
      return priced
        ? `   – ${customerName(priced)} separately: ${priceTat(priced)}`
        : `   – ${test.name}: not offered individually here`;
    });

  if (picks.length > 0) {
    const blocks = picks.map((option, index) => {
      const label = index === 0 ? "Covers the most tests" : "Cheapest overall";
      addProfile(option, `${label} — includes ${option.covered.length} of ${requested.length} tests`);
      return [
        `• ${label}: ${option.profile.name} – ${priceTat(option.profile)}`,
        `   Includes: ${option.covered.map((test) => test.name).join(", ")}`,
        `   Not included: ${option.missing.map((test) => test.name).join(", ")}`,
        ...missingLines(option),
        `   Total with the missing tests: ${formatCurrency({ amount: option.total, currency: option.profile.price.currency })}`,
      ].join("\n");
    });
    const text = [
      `No single profile includes ${allOf(requested.length)} tests (${topic}). Closest options:`,
      ...blocks,
      individuallyLine,
      notFound,
    ]
      .filter(Boolean)
      .join("\n");
    const best = picks[picks.length > 1 && picks[1].total < picks[0].total ? 1 : 0];
    const reply = [
      `Hi! We don't have a single package with all of these tests. The best option:`,
      "",
      `• ${customerName(best.profile)} – ${priceTat(best.profile)}`,
      ...best.missing.map((test) => {
        const priced = single(test);
        return priced
          ? `• ${customerName(priced)} (not in the package) – ${priceTat(priced)}`
          : `• ${test.name} – not included in the package`;
      }),
      "",
      `Total: ${formatCurrency({ amount: best.total, currency: best.profile.price.currency })}`,
      ...(notFound ? ["", `We couldn't find: ${group.notFound.join(", ")}.`] : []),
    ].join("\n");
    return { answer: { subject: "profile_match", verdict: "no", text }, reply, results, topic };
  }

  // No profile holds even two of them: each test on its own.
  const testLines = singleTests.map(({ test, priced }) => {
    if (priced) addTest(priced, "Not in any profile together — book individually");
    return priced ? `• ${customerName(priced)} – ${priceTat(priced)}` : `• ${test.name} – not offered individually here`;
  });
  const text = [
    `None of our profiles include these tests together (${topic}). Individually:`,
    ...testLines,
    individuallyLine,
    notFound,
  ]
    .filter(Boolean)
    .join("\n");
  const reply = [
    "Hi! These tests aren't available together in one package. Individually:",
    "",
    ...testLines,
    ...(individualTotal && allSoldAlone ? ["", `Total: ${formatCurrency(individualTotal)}`] : []),
    ...(notFound ? ["", `We couldn't find: ${group.notFound.join(", ")}.`] : []),
  ].join("\n");
  return { answer: { subject: "profile_match", verdict: "no", text }, reply, results, topic };
}

const FASTING_REPLY: Record<FastingInfo["required"], string> = {
  yes: "fasting required",
  recommended: "fasting preferred",
  no: "no fasting needed",
};
const FASTING_HEAD: Record<FastingInfo["required"], string> = { yes: "Yes", recommended: "Preferred", no: "No" };

/**
 * "Fasting needed for CBC, lipid profile and HbA1c?" — one line per test,
 * from the fasting guide (or Gemini's per-test answer for tests the guide
 * doesn't know). Never one merged yes/no for the whole list.
 */
export function perTestFasting(items: AiSuggestion[], notFound: string[]): { answer: AiAnswer; reply: string } {
  const known = items.filter((item) => item.fasting);
  const kinds = new Set(known.map((item) => item.fasting!.required));
  const verdict =
    known.length === 0 ? null : kinds.size === 1 ? (kinds.has("yes") ? "yes" : kinds.has("no") ? "no" : "preferred") : "depends";
  const text = [
    ...items.map((item) =>
      item.fasting
        ? `${item.name}: ${FASTING_HEAD[item.fasting.required]} — ${item.fasting.note}`
        : `${item.name}: not in our guide — please confirm with the lab team`
    ),
    notFoundLine(notFound),
  ]
    .filter(Boolean)
    .join("\n");
  const needsFasting = known.filter((item) => item.fasting!.required === "yes");
  const reply = [
    "Hi! Fasting for each test:",
    "",
    ...items.map(
      (item) =>
        `• ${customerName(item)} – ${item.fasting ? `${FASTING_REPLY[item.fasting.required]}${item.fasting.required === "no" ? "" : ` – ${item.fasting.note}`}` : "please confirm with us"}`
    ),
    ...(needsFasting.length > 0
      ? ["", "As they're collected together, please come fasting (plain water is fine) so every test can be done in one visit."]
      : []),
    ...(notFound.length > 0 ? ["", `We couldn't find: ${notFound.join(", ")}.`] : []),
  ].join("\n");
  return { answer: { subject: "fasting", verdict, text }, reply };
}

/** "TAT for CBC, TSH and Vit D?" — each test's own report time, from our records. */
export function perTestTat(items: AiSuggestion[], notFound: string[]): { answer: AiAnswer; reply: string } {
  const lines = items.map((item) => `${customerName(item)} – report ready in ${formatTat(item.tatText)}`);
  const text = [...items.map((item) => `${item.name}: ${formatTat(item.tatText)}`), notFoundLine(notFound)]
    .filter(Boolean)
    .join("\n");
  const reply = [
    "Hi! Report time for each test:",
    "",
    ...lines.map((line) => `• ${line}`),
    ...(notFound.length > 0 ? ["", `We couldn't find: ${notFound.join(", ")}.`] : []),
  ].join("\n");
  return { answer: { subject: "tat", verdict: null, text }, reply };
}
