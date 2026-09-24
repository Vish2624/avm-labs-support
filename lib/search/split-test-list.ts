/**
 * Splits free text naming several tests — a comma list of codes, a pasted
 * WhatsApp message, one test per line, "Test Required : A, B, C" — into
 * one token per test mention. Pure — shared by the client (to decide
 * whether the search box holds a list) and the server-side extractor.
 *
 * Deliberately doesn't split on "-", "(" or ")": they appear inside real
 * test names ("HEMOGRAM - 6 PART (DIFF)").
 */
const SPLIT_PATTERN = /[,\n\r\t;:|/?.!•*]+|\band\b|\bplus\b|\balso\b|&/i;

// List numbering ("1. TSH 2) Lipid profile") — a 1-2 digit number right
// before "." or ")" and whitespace. Turned into a separator first, so the
// "." split doesn't leave "TSH 2" behind.
const NUMBERING_PATTERN = /(^|\s)\d{1,2}[.)](?=\s)/g;

// Names copied from a list whose line breaks were lost run together:
// "Anti GADAnti Islet cellAnti Insulin Abs". A lowercase word (2+ letters)
// or an all-caps run (2+) directly followed by a Capitalized word (3+
// lowercase letters) is a missing break. Conservative on purpose so real
// names stay whole: "HbA1c", "HBsAg", "IgG", "HCV Ab" don't match.
const JOINED_NAMES_PATTERN = /([a-z]{2,}|[A-Z]{2,})(?=[A-Z][a-z]{3,})/g;

// Label/greeting words wrapped around test names without naming one:
// "Test Required :", "Hi, please send price for vit d", "cbc test pls".
// Stripped from the start and end of each token only — never the middle,
// where they can be part of a real name.
const LABEL_WORDS = new Set([
  "test", "tests", "required", "requested", "needed", "need", "needs", "list", "hi", "hello", "hey", "dear",
  "please", "pls", "plz", "kindly", "price", "prices", "cost", "costs", "rate", "rates", "charges", "quote",
  "quotation", "for", "the", "of", "is", "are", "what", "whats", "how", "much", "send", "share", "me",
  "we", "want", "to", "do", "can", "get", "you", "thanks", "thank", "details", "investigation",
  "investigations", "sir", "madam", "mam", "team", "check", "done",
]);
// (No single letters like "a" — "Vitamin A" / "Hepatitis A" end in one.)

function stripLabelWords(token: string): string {
  const words = token.split(" ");
  let start = 0;
  let end = words.length;
  while (start < end && LABEL_WORDS.has(words[start].toLowerCase())) start++;
  while (end > start && LABEL_WORDS.has(words[end - 1].toLowerCase())) end--;
  return words.slice(start, end).join(" ");
}

export function splitTestList(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const separated = text.replace(NUMBERING_PATTERN, "\n").replace(JOINED_NAMES_PATTERN, "$1\n");
  for (const raw of separated.split(SPLIT_PATTERN)) {
    const token = stripLabelWords(raw.replace(/\s+/g, " ").trim());
    if (token.length < 2) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

/** True when a search-box query is a list of tests rather than one test. */
export function isTestList(text: string): boolean {
  const hasSeparator = /[,\n;|]/.test(text) || new RegExp(JOINED_NAMES_PATTERN.source).test(text);
  return hasSeparator && splitTestList(text).length >= 2;
}
