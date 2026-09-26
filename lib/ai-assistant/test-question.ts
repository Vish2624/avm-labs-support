import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { hydrateProfileTests } from "@/lib/profiles/hydrate-profile-tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { matchScore } from "@/lib/search/fuzzy-match";
import { buildSearchCandidates } from "@/lib/search/build-search-candidates";
import { rankResults } from "@/lib/search/rank-results";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { SERVICE_TYPE_LABELS } from "@/lib/constants/service-types";
import { matchTopics } from "./builtin-engine";
import { findPriced, suggestionKey, toSuggestion, type PricedCatalog, type PricedItem } from "./priced-catalog";
import type { AiAnswer, AiSuggestion, TestQuestionSubject } from "@/types/ai-assistant";
import type { ProfileTestSummary } from "@/types/profile";

const SUBJECT_PATTERNS: [TestQuestionSubject, RegExp][] = [
  ["fasting", /\b(fasting|fast|empty stomach|eat|eating|ate|food|breakfast|meal|drink|drinking|water|tea|coffee)\b/],
  [
    "components",
    /\b(param\w*|components?|includes?|included|including|contains?|containing|consists?|covers?|covered|inside|breakdown|tests? (in|of|under|inside)|what s in)\b/,
  ],
  ["tat", /\b(tat|how long|how many days|how many hours|report time|turnaround|result time|results? ready|report ready|when will|when can)\b/],
  ["price", /\b(price|prices|cost|costs|rate|rates|charge|charges|how much|fee|fees)\b/],
  ["availability", /\b(available|availability|do you have|do you do|do you offer)\b/],
];

// Words around a test name in a question about it: "does the thyroid test
// need fasting", "how much is vitamin d", "when will hba1c report be ready".
export const QUESTION_FILLER = new Set([
  "what", "whats", "is", "are", "the", "a", "an", "of", "for", "to", "be", "it", "its", "in", "at", "on", "with", "and",
  "or", "do", "does", "did", "should", "can", "could", "will", "would", "i", "we", "you", "he", "she", "they", "my",
  "me", "your", "our", "customer", "patient", "client", "he", "his", "her", "test", "tests", "testing", "need", "needs",
  "needed", "require", "requires", "required", "requirement", "necessary", "mandatory", "compulsory", "fasting", "fast",
  "empty", "stomach", "eat", "eating", "ate", "food", "breakfast", "meal", "drink", "drinking", "water", "tea", "coffee",
  "before", "after", "any", "there", "hours", "hour", "how", "long", "many", "days", "much", "price", "prices", "cost",
  "costs", "rate", "rates", "charge", "charges", "fee", "fees", "tat", "report", "reports", "result", "results",
  "ready", "time", "turnaround", "when", "available", "availability", "have", "has", "offer", "please", "pls", "tell",
  "know", "want", "wants", "ok", "okay", "allowed", "taking", "take", "doing", "done", "go", "come", "yes", "no",
  "check", "this", "that", "which", "kind", "type", "sample", "blood", "level", "levels", "also", "just", "only",
  "give", "show", "list", "all", "every", "full", "complete", "include", "includes", "included", "including", "contain",
  "contains", "containing", "consist", "consists", "cover", "covers", "covered", "inside", "breakdown", "component",
  "components", "items", "things", "under", "part", "parts", "normal", "range", "ranges", "reference", "value",
  "values", "mean", "means", "meaning", "why", "high", "low", "purpose", "used", "use", "explain", "about", "s",
]);
/** "parameters", and misspellings like "paramters" / "params". */
const PARAMETER_WORD = /^param/;
const PACKAGE_WORDS = /\b(profile|package|panel|pack)\b/g;

/** Test named exactly or by an exact alias (score 100), or a package name matching at least this well (0-100). */
const PACKAGE_MATCH_SCORE = 88;
const MAX_ITEMS = 5;

export function detectSubject(question: string): TestQuestionSubject | null {
  const normalized = normalizeQuery(question);
  return SUBJECT_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

/** The test name left in a question once the question words are stripped: "does thyroid test need fasting" -> "thyroid". */
export function testNameIn(question: string): string {
  return normalizeQuery(question)
    .split(" ")
    .filter((word) => word && !QUESTION_FILLER.has(word) && !PARAMETER_WORD.test(word))
    .join(" ");
}

/**
 * Is the name exactly one of the catalog's packages, by code or full name
 * ("avm diabetic profile 1 2", "adp1 1")? Such a question with no question
 * words ("avm diabetic profile 1.2 tests") is asking what the package holds.
 */
export function namesPackageExactly(name: string, catalog: PricedCatalog): boolean {
  const packageName = name.replace(PACKAGE_WORDS, " ").replace(/\s+/g, " ").trim();
  return catalog.items.some((item) => {
    if (item.kind !== "package") return false;
    const full = normalizeQuery(item.name);
    const bare = full.replace(PACKAGE_WORDS, " ").replace(/\s+/g, " ").trim();
    return name === normalizeQuery(item.code) || name === full || (packageName !== "" && packageName === bare);
  });
}

/** "avm 1 1" -> "1 1": the numbers in a name, in order. */
const digitGroups = (text: string) => (text.match(/\d+/g) ?? []).join(" ");

/**
 * The catalog items a short name refers to — only confident matches: a
 * test by exact code/name/alias, or a package whose own name matches
 * strongly. With `allowTopic`, a plain-words name with no exact item
 * ("sugar", "cholesterol") falls back to its topic's main tests.
 */
export async function resolveNamedItems(
  name: string,
  catalog: PricedCatalog,
  allowTopic: boolean
): Promise<PricedItem[]> {
  if (!name) return [];
  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const testById = new Map(tests.map((test) => [test.id, test]));

  const found = new Map<string, PricedItem>();
  const add = (item: PricedItem | undefined) => {
    if (item && found.size < MAX_ITEMS && !found.has(suggestionKey(item))) found.set(suggestionKey(item), item);
  };

  const packageName = name.replace(PACKAGE_WORDS, " ").replace(/\s+/g, " ").trim();
  // Fuzzy scores ignore version numbers ("avm 1.1" scores the same against
  // 1.1, 1.2 and 1.3), so a name with numbers only matches a package whose
  // name or code has exactly those numbers.
  const numbers = digitGroups(name);
  const packages = catalog.items
    .filter((item) => item.kind === "package")
    .filter(
      (item) =>
        numbers === "" ||
        digitGroups(normalizeQuery(item.name)) === numbers ||
        digitGroups(normalizeQuery(item.code)) === numbers
    )
    .map((item) => {
      const code = normalizeQuery(item.code);
      const full = normalizeQuery(item.name);
      const bare = full.replace(PACKAGE_WORDS, " ").replace(/\s+/g, " ").trim();
      const score =
        name === code || name === full || (packageName && packageName === bare)
          ? 100
          : Math.max(matchScore(name, code), matchScore(name, full), packageName ? matchScore(packageName, bare) : 0) * 100;
      return { item, score };
    })
    .filter(({ score }) => score >= PACKAGE_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  const exactTests = rankResults(buildSearchCandidates(name, tests, aliases)).filter(
    (candidate) => candidate.matchType === "exact" || candidate.exact || candidate.score >= 100
  );

  // Exact tests first, then packages — unless the package is the exact match ("lipid profile", "lft").
  const exactPackage = packages.length > 0 && packages[0].score >= 100;
  if (exactPackage) packages.filter(({ score }) => score >= 100).slice(0, 2).forEach(({ item }) => add(item));
  for (const candidate of exactTests) {
    const test = testById.get(candidate.testId);
    if (test) add(findPriced(catalog, test.code));
  }
  if (found.size === 0) packages.slice(0, 2).forEach(({ item }) => add(item));

  // Several tests named in one go ("tsh t3 t4", "cbc and vitamin d"):
  // longest exact names first, left to right, so "vitamin d" stays whole.
  if (found.size === 0 && name.includes(" ")) {
    const words = name.split(" ");
    const exactItem = (phrase: string) => {
      const exact = rankResults(buildSearchCandidates(phrase, tests, aliases)).find(
        (candidate) => candidate.matchType === "exact" || candidate.exact
      );
      const test = exact ? testById.get(exact.testId) : undefined;
      return test ? findPriced(catalog, test.code) : findPriced(catalog, phrase);
    };
    for (let i = 0; i < words.length; ) {
      let length = Math.min(3, words.length - i);
      for (; length > 0; length--) {
        const phrase = words.slice(i, i + length).join(" ");
        const item = phrase.length >= 2 ? exactItem(phrase) : undefined;
        if (item) {
          add(item);
          break;
        }
      }
      i += Math.max(length, 1);
    }
  }

  if (found.size === 0 && allowTopic) {
    const [topic] = matchTopics(name);
    for (const item of topic?.items.filter((entry) => entry.level === "high") ?? []) {
      add(item.codes.map((code) => findPriced(catalog, code)).find(Boolean));
    }
  }
  return [...found.values()];
}

export function toDetailSuggestions(items: PricedItem[]): AiSuggestion[] {
  return items.map((item, index) =>
    toSuggestion(item, { score: 1 - index * 0.01, level: "high", reason: item.kind === "package" ? `Package of ${item.tests.length} tests` : "Test details" })
  );
}

function componentLines(name: string, tests: ProfileTestSummary[]): string {
  if (tests.length === 0) return `${name}: no parameter list in our records — please confirm with the lab team.`;
  const list = tests.map((test, index) => `${index + 1}. ${test.officialName}`).join("\n");
  return `${name} includes ${tests.length} parameter${tests.length === 1 ? "" : "s"}:\n${list}`;
}

/**
 * "What parameters are in CBC?" — a package lists its own tests; a single
 * test uses the package stored under the same code or name (the parameter
 * roster lives in profile_tests). Only stored data, never a guessed list.
 */
export async function componentsAnswer(items: AiSuggestion[]): Promise<AiAnswer> {
  const profiles = await listActiveProfilesWithTests();
  const matchFor = (item: AiSuggestion) =>
    profiles.find(
      ({ profile, testIds }) =>
        testIds.length > 0 &&
        (normalizeQuery(profile.code) === normalizeQuery(item.code) ||
          normalizeQuery(profile.name) === normalizeQuery(item.name))
    );
  const testItems = items.filter((item) => item.kind === "test");
  const rosters = await hydrateProfileTests(
    new Map(
      testItems.flatMap((item) => {
        const match = matchFor(item);
        return match ? [[match.profile.id, match.testIds] as const] : [];
      })
    )
  );
  const text = items
    .map((item) => {
      if (item.kind === "package") return componentLines(item.name, item.tests);
      const match = matchFor(item);
      return componentLines(item.name, match ? (rosters.get(match.profile.id) ?? []) : []);
    })
    .join("\n\n");
  return { subject: "components", verdict: null, text };
}

const FASTING_WORD = { yes: "Yes", no: "No", recommended: "Preferred" } as const;

/** The built-in reply, from the fasting guide and the items' own DB fields. */
export function builtinAnswer(subject: TestQuestionSubject, items: AiSuggestion[]): AiAnswer {
  const lines = (render: (item: AiSuggestion) => string) => items.map(render).join("\n");

  switch (subject) {
    case "fasting": {
      const known = items.filter((item) => item.fasting);
      if (known.length === 0) {
        return {
          subject,
          verdict: null,
          text: `Our guide has no fasting information for ${items.map((item) => item.name).join(", ")} — please confirm with the lab team.`,
        };
      }
      const kinds = new Set(known.map((item) => item.fasting!.required));
      const verdict = kinds.size === 1 ? (kinds.has("yes") ? "yes" : kinds.has("no") ? "no" : "preferred") : "depends";
      return {
        subject,
        verdict,
        text: lines((item) =>
          item.fasting
            ? `${item.name}: ${FASTING_WORD[item.fasting.required]} — ${item.fasting.note}`
            : `${item.name}: no fasting information in our guide`
        ),
      };
    }
    case "components":
      return {
        subject,
        verdict: null,
        text: items
          .map((item) => componentLines(item.name, item.kind === "package" ? item.tests : []))
          .join("\n\n"),
      };
    case "price":
      // Prices stay in Test search, not in the assistant.
      return {
        subject,
        verdict: null,
        text: "Found in our test list — open it in Test search to see the price and add it to the quotation.",
      };
    case "tat":
      return { subject, verdict: null, text: lines((item) => `${item.name}: report ready in ${formatTat(item.tatText)}`) };
    case "availability":
      return {
        subject,
        verdict: items.every((item) => item.availability === "available") ? "yes" : null,
        text: lines(
          (item) => `${item.name}: ${AVAILABILITY_LABELS[item.availability]} · ${SERVICE_TYPE_LABELS[item.serviceType]}`
        ),
      };
    case "details":
    case "general":
      return { subject, verdict: null, text: "Here are the details from our test list." };
  }
}
