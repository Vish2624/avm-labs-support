/**
 * Typo-tolerant similarity scoring between a query and candidate text.
 * Both inputs are expected to already be run through normalizeQuery()
 * (lowercase, punctuation -> space, single spaces, trimmed). Pure — no DB.
 *
 * matchScore() combines three signals and keeps the strongest:
 * 1. Spacing-insensitive equality/prefix ("b 12" = "b12", "hb a1c" = "hba1c",
 *    "vitam" -> "vitamin d").
 * 2. Word-by-word matching: every query word is matched to its best
 *    candidate word — exact, prefix (still typing), within a small edit
 *    distance (misspelt: "vitmin", "cholestrol", "thyriod"), or two
 *    candidate words run together ("vitd" -> "vit d"). Filler words like
 *    "test"/"level" are ignored when the query has other words.
 * 3. Character-trigram Jaccard similarity (pg_trgm-style), which catches
 *    scrambled or heavily misspelt input the word matcher misses.
 *
 * Returns 0 (no match) to 1 (identical).
 */
export function matchScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;

  const queryCompact = compact(query);
  const candidateCompact = compact(candidate);
  if (queryCompact === candidateCompact) return 1;

  let best = 0;

  // Typed the start of the name, ignoring spaces: "vitam" / "vitamind3".
  if (queryCompact.length >= 3 && candidateCompact.startsWith(queryCompact)) {
    best = Math.max(best, 0.8 + 0.15 * (queryCompact.length / candidateCompact.length));
  }

  best = Math.max(best, wordScore(query, candidate));
  // A short identifying word the candidate doesn't have at all ("k" in
  // "vitamin k", "t4" in "ft4 test") means it's a different test, however
  // alike the rest of the letters are — so letter similarity can't rescue it
  // ("vitamin k" must never read as Vitamin B12).
  if (missesShortWord(query, candidate)) return Math.min(best, 1);
  best = Math.max(best, trigramSimilarity(query, candidate), trigramSimilarity(queryCompact, candidateCompact));
  return Math.min(best, 1);
}

/** A meaningful query word of 1-3 characters that matches none of the candidate's words (or its run-together pairs). */
function missesShortWord(query: string, candidate: string): boolean {
  const candidateWords = candidate.split(" ");
  const words = meaningfulWords(query);
  if (words.length < 2) return false;
  return words.some((word) => word.length <= 3 && scoreWord(word, candidateWords) === 0);
}

// Words customers add around a test name that carry no matching signal.
const FILLER_WORDS = new Set([
  "test", "tests", "testing", "level", "levels", "check", "checkup", "price", "prices", "cost", "rate",
  "please", "pls", "for", "the", "of", "a", "an", "and", "my", "in", "blood", "serum",
]);

/**
 * The query's words that carry matching signal: filler words dropped, and a
 * last word that is a filler word still being typed ("thyroid tes", "vit d
 * lev"). Falls back to all words when nothing else is left.
 */
function meaningfulWords(query: string): string[] {
  const words = query.split(" ");
  const last = words.length - 1;
  const meaningful = words.filter(
    (word, i) =>
      !FILLER_WORDS.has(word) &&
      !(i === last && last > 0 && word.length >= 2 && [...FILLER_WORDS].some((filler) => filler.length > word.length && filler.startsWith(word)))
  );
  return meaningful.length > 0 ? meaningful : words;
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

// Allowed typos grow with word length: short words must be near-exact, or
// "tsh" would match "ast" and "cbc" would match "cea".
function allowedEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 8) return 2;
  return 3;
}

/** `word` is `target` with exactly one letter removed (and its first letter kept). */
function isOneLetterDropped(word: string, target: string): boolean {
  if (word[0] !== target[0]) return false;
  for (let i = 1; i < target.length; i++) {
    if (target.slice(0, i) + target.slice(i + 1) === word) return true;
  }
  return false;
}

/** Best score for one query word against the candidate's words. */
function scoreWord(word: string, candidateWords: string[]): number {
  let best = 0;
  const allowed = allowedEdits(word.length);

  for (let i = 0; i < candidateWords.length; i++) {
    const target = candidateWords[i];
    if (word === target) return 1;

    // Still typing: "vit" -> "vitamin". Short prefixes only count on a
    // word's start, and need 2+ characters to mean anything.
    if (word.length >= 2 && target.startsWith(word)) {
      best = Math.max(best, 0.75 + 0.2 * (word.length / target.length));
    }

    // Two candidate words run together: "vitd" -> "vit d", "b12" -> "b 12".
    const next = candidateWords[i + 1];
    if (next) {
      const joined = target + next;
      if (joined === word) return 1;
      else if (word.length >= 3 && joined.startsWith(word)) best = Math.max(best, 0.8);
    }

    if (allowed > 0) {
      // Misspelt whole word: "vitmin" -> "vitamin", "cholestrol" -> "cholesterol".
      const distance = damerauLevenshtein(word, target, allowed);
      if (distance <= allowed) best = Math.max(best, 0.9 - 0.1 * distance);

      // Misspelt while still typing: "vitmi" -> "vitamin".
      if (target.length > word.length) {
        const prefixDistance = damerauLevenshtein(word, target.slice(0, word.length), allowed);
        if (prefixDistance <= allowed) best = Math.max(best, 0.75 - 0.1 * prefixDistance);
      }
    } else if (word.length === 3 && target.length === 4 && isOneLetterDropped(word, target)) {
      // A 4-letter word typed with one letter left out: "acd" -> "acid",
      // "irn" -> "iron". Still never two different 3-letter codes ("tsh" vs
      // "ast"): those are the same length, so no letter was dropped.
      best = Math.max(best, 0.8);
    }
  }
  return best;
}

function wordScore(query: string, candidate: string): number {
  const queryWords = meaningfulWords(query);
  const candidateWords = candidate.split(" ");

  let total = 0;
  for (const word of queryWords) {
    const score = scoreWord(word, candidateWords);
    // A query word that matches nothing is strong evidence this isn't the
    // test being asked for — don't let the other words carry it.
    if (score === 0) return 0;
    total += score;
  }
  const average = total / queryWords.length;
  // Prefer candidates whose words the query mostly accounts for, so
  // "vitamin d" ranks "Vitamin D" above "Vitamin D 25-OH Total Panel".
  const coverage = Math.min(1, queryWords.length / candidateWords.length);
  return average * (0.85 + 0.15 * coverage);
}

/**
 * Optimal-string-alignment Damerau-Levenshtein distance (a swap of two
 * adjacent letters, "thyriod", counts as one edit). Stops early and
 * returns max + 1 once the distance must exceed `max`.
 */
// Three reusable rows (two back, previous, current) — search runs this
// thousands of times per query, so it shouldn't allocate a matrix each call.
let rowBuffers: [Int32Array, Int32Array, Int32Array] = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

function damerauLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const cols = b.length + 1;
  if (rowBuffers[0].length < cols) {
    rowBuffers = [new Int32Array(cols * 2), new Int32Array(cols * 2), new Int32Array(cols * 2)];
  }
  let [twoBack, previous, current] = rowBuffers;
  for (let j = 0; j < cols; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    [twoBack, previous, current] = [previous, current, twoBack];
  }
  return previous[b.length];
}

/**
 * pg_trgm-style similarity: pad the string, extract character trigrams,
 * score by Jaccard similarity (shared trigrams / union of trigrams).
 */
function trigramSimilarity(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const queryGrams = trigrams(query);
  const candidateGrams = trigrams(candidate);
  if (queryGrams.size === 0 || candidateGrams.size === 0) return 0;

  let shared = 0;
  for (const gram of queryGrams) {
    if (candidateGrams.has(gram)) shared += 1;
  }
  const union = queryGrams.size + candidateGrams.size - shared;
  return union === 0 ? 0 : shared / union;
}

// Catalog strings are scored against every query, so their trigram sets
// are memoized. Bounded so arbitrary query text can't grow it forever.
const TRIGRAM_CACHE_LIMIT = 20_000;
const trigramCache = new Map<string, Set<string>>();

/** Character trigrams of a padded string, e.g. "cbc" -> {"  c", " cb", "cbc", "bc "}. */
function trigrams(value: string): Set<string> {
  const cached = trigramCache.get(value);
  if (cached) return cached;
  if (trigramCache.size >= TRIGRAM_CACHE_LIMIT) trigramCache.clear();
  const grams = computeTrigrams(value);
  trigramCache.set(value, grams);
  return grams;
}

function computeTrigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}
