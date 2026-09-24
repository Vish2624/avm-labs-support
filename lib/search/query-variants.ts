import { normalizeQuery } from "./normalize-query";

/**
 * The phrasings of one search that are worth matching, so agents can type
 * the way they speak: "I need thyroid test" -> "thyroid", "female health
 * package" -> "female wellness". Pure — vocabulary only, never a medical
 * inference: every variant is still matched against real catalog names,
 * codes and aliases, and nothing is returned that the database doesn't have.
 */

// Conversational words around a test name that name nothing themselves
// (no single letters: "Vitamin A", "Hepatitis A" end in one),
// including common typos of "test".
const CONVERSATIONAL_WORDS = new Set([
  "i", "im", "we", "need", "needs", "needed", "want", "wants", "looking", "look", "for", "the", "to",
  "test", "tests", "testt", "tset", "testing", "check", "checkup", "please", "pls", "plz", "kindly",
  "price", "prices", "cost", "rate", "rates", "of", "my", "me", "do", "you", "have", "is", "there", "what",
  "whats", "how", "much", "get", "done", "can", "show", "find", "search", "about", "some", "any",
]);

// Words that describe a bundle rather than name one — matched away when
// searching package names ("thyroid profile" -> Total Thyroid, Thyro 5).
const BUNDLE_WORDS = new Set([
  "profile", "profiles", "package", "packages", "panel", "panels", "pack", "combo",
  // Common typos of the above.
  "profle", "profil", "prfile", "proflie", "pofile", "pakage", "packge", "pacakge", "pakcage", "packag", "panal",
]);

// Everyday vocabulary that means the same thing in a catalog name.
const SYNONYMS: Record<string, string[]> = {
  sugar: ["glucose"],
  glucose: ["sugar"],
  health: ["wellness"],
  wellness: ["health"],
  female: ["women", "woman"],
  women: ["female"],
  woman: ["female"],
  ladies: ["female", "women"],
  male: ["men", "man"],
  men: ["male"],
  man: ["male"],
  kidney: ["renal"],
  renal: ["kidney"],
  diabetes: ["diabetic"],
  diabetic: ["diabetes"],
  hormone: ["hormones"],
  hormones: ["hormone"],
};

/** Most variants tried per query, the original first. */
const MAX_VARIANTS = 6;

function stripWords(normalized: string, drop: Set<string>): string {
  const words = normalized.split(" ");
  const kept = words.filter((word) => !drop.has(word));
  // Everything was filler ("test"): keep the query as typed.
  return kept.length > 0 ? kept.join(" ") : normalized;
}

/**
 * Normalized variants of a query, original first. `forPackages` also drops
 * bundle words ("profile", "package") since package names often omit them.
 */
export function queryVariants(raw: string, options: { forPackages?: boolean } = {}): string[] {
  const normalized = normalizeQuery(raw);
  if (!normalized) return [];

  const variants = [normalized];
  const add = (value: string) => {
    if (value && !variants.includes(value) && variants.length < MAX_VARIANTS) variants.push(value);
  };

  let cleaned = stripWords(normalized, CONVERSATIONAL_WORDS);
  if (options.forPackages) cleaned = stripWords(cleaned, BUNDLE_WORDS);
  add(cleaned);

  // One synonym swap at a time, on the cleaned phrasing.
  const words = cleaned.split(" ");
  words.forEach((word, i) => {
    for (const synonym of SYNONYMS[word] ?? []) {
      add([...words.slice(0, i), synonym, ...words.slice(i + 1)].join(" "));
    }
  });

  return variants;
}

/** Score kept for a match found only through a rephrased variant, vs. the query as typed. */
export const VARIANT_SCORE_FACTOR = 0.97;
