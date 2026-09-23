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
  best = Math.max(best, trigramSimilarity(query, candidate), trigramSimilarity(queryCompact, candidateCompact));
  return Math.min(best, 1);
}

// Words customers add around a test name that carry no matching signal.
const FILLER_WORDS = new Set([
  "test", "tests", "testing", "level", "levels", "check", "checkup", "price", "prices", "cost", "rate",
  "please", "pls", "for", "the", "of", "a", "an", "and", "my", "in", "blood", "serum",
]);

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
    }
  }
  return best;
}

function wordScore(query: string, candidate: string): number {
  const allQueryWords = query.split(" ");
  const meaningful = allQueryWords.filter((word) => !FILLER_WORDS.has(word));
  const queryWords = meaningful.length > 0 ? meaningful : allQueryWords;
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
function damerauLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, d[i - 2][j - 2] + 1);
      }
      d[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
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

/** Character trigrams of a padded string, e.g. "cbc" -> {"  c", " cb", "cbc", "bc "}. */
function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}
