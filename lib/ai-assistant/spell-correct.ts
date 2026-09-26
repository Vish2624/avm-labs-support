import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { PRE_TREATMENT_ITEMS, TOPICS } from "./topic-guide";
import { QUESTION_FILLER } from "./test-question";
import type { PricedCatalog } from "./priced-catalog";

// Words the assistant's rules look for that aren't in the filler list.
const QUESTION_WORDS = [
  "fasting", "parameter", "parameters", "profile", "package", "panel", "normal", "function", "functions",
  "vitamin", "hormone", "tests", "test", "includes", "include", "contains", "components",
];

// Everyday words in customers' messages that must never be "corrected"
// into a catalog word ("feel" -> "fees").
const EVERYDAY_WORDS = `
  feel feels feeling felt tired weak body pain pains hurts hurting ache aching mother father wife husband son daughter
  child children baby kids family brother sister friend patient person people years year months month weeks week
  daily always often sometimes since last recently lately every morning night evening today tomorrow yesterday
  good well sick unwell healthy health better worse normal problem problems issue issues symptom symptoms condition
  doctor told advised says said asked suggest suggested recommend recommended prescribed medicine medicines tablet
  tablets pills taking started starting stop stopped going planning plan want wants would like need needs please
  thanks thank hello dear kindly regarding about which what when where does have been were will shall could should
  also some more most much many very really just only even still again from into with without over than then them
  they their there these those this that here home work office visit come coming book booking appointment collect
  collection sample home weight gain loss lose losing heavy high rising dizzy dizziness fever cold cough swelling
  skin hair nails bones joints joint back knee knees neck head headache stomach chest heart sugar blood urine stool
  full complete whole list names name tell know check checking checked done report reports result results value
`.split(/\s+/);

/** Shorter words are left alone: too many real words sit one letter apart ("bp", "tsh", "ldl"). */
const MIN_WORD_LENGTH = 4;

/** Typos allowed for a word of this length: 1 for 4-5 letters, 2 for 6-9, 3 beyond. */
function maxEdits(length: number): number {
  return length <= 5 ? 1 : length <= 9 ? 2 : 3;
}

/** Optimal-string-alignment distance: insert, delete, substitute, or swap two neighbours ("tets" -> "test"). */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** Every word the assistant can understand: question words, the topic guide, and our own test/package names and aliases. */
async function vocabulary(catalog: PricedCatalog): Promise<string[]> {
  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const phrases = [
    ...QUESTION_WORDS,
    ...EVERYDAY_WORDS,
    ...QUESTION_FILLER,
    ...TOPICS.flatMap((topic) => [...topic.keywords, ...topic.items.map((item) => item.label)]),
    ...PRE_TREATMENT_ITEMS.map((item) => item.label),
    ...tests.flatMap((test) => [test.officialName, test.shortName ?? ""]),
    ...aliases.map((alias) => alias.alias),
    ...catalog.items.map((item) => item.name),
  ];
  const words = new Set<string>();
  for (const phrase of phrases) {
    for (const word of normalizeQuery(phrase).split(" ")) {
      if (word.length >= MIN_WORD_LENGTH && !/\d/.test(word)) words.add(word);
    }
  }
  return [...words];
}

/**
 * Fixes misspelled words in a question against the assistant's own
 * vocabulary — "lipd profle", "does vitamn d need fastng", "ferittin" —
 * so every later step (question type, test names, topics) sees the right
 * word. Known words, short words and anything with digits (codes like
 * "adp1.1") are kept as typed. Returns the normalized, corrected question.
 */
export async function correctSpelling(question: string, catalog: PricedCatalog): Promise<string> {
  const words = normalizeQuery(question).split(" ").filter(Boolean);
  const candidates = words.filter((word) => word.length >= MIN_WORD_LENGTH && !/\d/.test(word));
  if (candidates.length === 0) return words.join(" ");

  const vocab = await vocabulary(catalog);
  const known = new Set(vocab);
  const corrected = new Map<string, string>();
  for (const word of candidates) {
    if (known.has(word) || corrected.has(word)) continue;
    const limit = maxEdits(word.length);
    let best: { word: string; distance: number } | null = null;
    for (const entry of vocab) {
      const distance = editDistance(word, entry, limit);
      if (distance > limit) continue;
      // Closest wins; on a tie, the one sharing the first letter ("fastng" -> "fasting", not "lasting").
      const better =
        !best ||
        distance < best.distance ||
        (distance === best.distance && entry[0] === word[0] && best.word[0] !== word[0]);
      if (better) best = { word: entry, distance };
    }
    if (best) corrected.set(word, best.word);
  }
  return words.map((word) => corrected.get(word) ?? word).join(" ");
}
