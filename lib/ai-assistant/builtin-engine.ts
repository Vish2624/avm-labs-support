import { normalizeQuery } from "@/lib/search/normalize-query";
import { matchScore } from "@/lib/search/fuzzy-match";
import { PRE_TREATMENT_ITEMS, PRE_TREATMENT_PATTERN, TOPICS, type Topic, type TopicItem } from "./topic-guide";
import { findPriced, suggestionKey, toSuggestion, type PricedCatalog } from "./priced-catalog";
import type { AiSuggestion } from "@/types/ai-assistant";

/** A typo'd keyword ("diabetis", "thyriod") still counts at this 0-1 similarity. */
const KEYWORD_FUZZY_SCORE = 0.8;
/** Keywords this short must match a whole word exactly ("bp" never matches "bpm"). */
const EXACT_ONLY_LENGTH = 4;
const MAX_TOPICS = 3;
const MAX_RESULTS = 12;

/** One question word against one keyword word: exact, or a close misspelling of a longer word. */
function wordMatches(word: string, target: string): boolean {
  if (word === target) return true;
  return (
    target.length > EXACT_ONLY_LENGTH &&
    Math.abs(word.length - target.length) <= 2 &&
    matchScore(word, target) >= KEYWORD_FUZZY_SCORE
  );
}

/**
 * Does the question mention this keyword — every word of it, in order,
 * each exact or a close misspelling ("diabetis", "thyriod")? Word by word,
 * so "chest pain" never passes for "knee pain".
 */
function mentions(words: string[], keyword: string): boolean {
  const target = normalizeQuery(keyword).split(" ");
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((part, j) => wordMatches(words[i + j], part))) return true;
  }
  return false;
}

/** Topics the question is about, in order of first mention. */
export function matchTopics(question: string): Topic[] {
  const normalized = normalizeQuery(question);
  const words = normalized.split(" ").filter(Boolean);
  const found: { topic: Topic; position: number }[] = [];
  for (const topic of TOPICS) {
    if (!topic.keywords.some((keyword) => mentions(words, keyword))) continue;
    const firstKeyword = topic.keywords.map((keyword) => normalized.indexOf(normalizeQuery(keyword))).filter((i) => i >= 0);
    found.push({ topic, position: firstKeyword.length > 0 ? Math.min(...firstKeyword) : normalized.length });
  }
  return found.sort((a, b) => a.position - b.position).slice(0, MAX_TOPICS).map(({ topic }) => topic);
}

export function asksBeforeTreatment(question: string): boolean {
  return PRE_TREATMENT_PATTERN.test(normalizeQuery(question));
}

export interface BuiltinResult {
  topicLabel: string | null;
  intent: string | null;
  results: AiSuggestion[];
  /** Relevant tests the catalog doesn't sell at this location. */
  unavailable: string[];
}

/**
 * The assistant's rule-based engine: match the question to topics in the
 * built-in guide, then keep only the guide's items that are priced at this
 * location. Deterministic, free, and works without any API key.
 */
export function recommendFromGuide(question: string, catalog: PricedCatalog): BuiltinResult {
  const topics = matchTopics(question);
  const beforeTreatment = asksBeforeTreatment(question);
  if (topics.length === 0 && !beforeTreatment) {
    return { topicLabel: null, intent: null, results: [], unavailable: [] };
  }

  const entries: { item: TopicItem; topicIndex: number; rank: number }[] = topics.flatMap((topic, topicIndex) =>
    topic.items.map((item, rank) => ({ item, topicIndex, rank }))
  );
  if (beforeTreatment) {
    entries.push(...PRE_TREATMENT_ITEMS.map((item, rank) => ({ item, topicIndex: topics.length, rank })));
  }

  const byKey = new Map<string, AiSuggestion>();
  const unavailable = new Set<string>();
  const foundLabels = new Set<string>();
  for (const { item, topicIndex, rank } of entries) {
    const priced = item.codes.map((code) => findPriced(catalog, code)).find(Boolean);
    if (!priced) {
      if (item.level === "high" || item.codes.length === 0) unavailable.add(item.label);
      continue;
    }
    foundLabels.add(item.label);
    // High items first, the first-mentioned topic ahead of later ones.
    const base = item.level === "high" ? 0.95 : 0.7;
    const score = Math.round((base - topicIndex * 0.04 - rank * 0.01) * 100) / 100;
    const key = suggestionKey(priced);
    const existing = byKey.get(key);
    if (existing && (existing.relevanceLevel === "high" || item.level === "medium")) continue;
    byKey.set(key, toSuggestion(priced, { score, level: item.level, reason: item.reason }));
  }
  // Found for another topic (e.g. LFT priced once, listed twice) isn't "unavailable".
  for (const label of foundLabels) unavailable.delete(label);

  const results = [...byKey.values()]
    .sort((a, b) => (a.relevanceLevel === b.relevanceLevel ? b.relevanceScore - a.relevanceScore : a.relevanceLevel === "high" ? -1 : 1))
    .slice(0, MAX_RESULTS);

  return {
    topicLabel: topics.length > 0 ? topics.map((topic) => topic.label).join(" / ") : "Pre-treatment baseline",
    intent: beforeTreatment ? "Checks before starting medication / treatment" : "Relevant diagnostic tests",
    results,
    unavailable: [...unavailable],
  };
}
