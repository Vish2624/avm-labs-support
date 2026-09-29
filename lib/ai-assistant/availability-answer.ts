import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { buildSearchCandidates } from "@/lib/search/matching/build-search-candidates";
import { rankResults } from "@/lib/search/matching/rank-results";
import { aiSearchCatalog } from "@/lib/search/reading/ai-read-message";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { customerName } from "./customer-labels";
import { findPriced, listOrder, suggestionKey, toSuggestion, type PricedCatalog, type PricedItem } from "./priced-catalog";
import { detectSubject, resolveNamedItems, testNameIn, toDetailSuggestions } from "./test-question";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AiAssistantResponse } from "@/types/ai-assistant";

/** Most similar tests offered when the one asked about isn't available. */
const MAX_ALTERNATIVES = 5;
/** A fuzzy-matched test counts as similar at or above this 0-100 score (fallback when Gemini can't answer). */
const SIMILAR_MIN_SCORE = 45;

/** "available", and the misspellings agents type ("availabe", "avaliable"). */
const AVAILABILITY_WORD = /^av(ai|ia|a|i)l/;

type AvailabilityResponse = Pick<
  AiAssistantResponse,
  "kind" | "lookupQuery" | "answer" | "reply" | "results" | "engine" | "sources" | "topic" | "intent"
>;

const priceLine = (item: PricedItem) =>
  `${customerName(item)} – ${formatCurrency(item.price)}, report ready in ${formatTat(item.tatText)}`;

/**
 * "Is vitamin D available?" / "do you have vitamin K test?" — answered only
 * from our own records:
 * - available: one clear answer with its price and report time;
 * - not in our list here, or currently unavailable: says the exact test
 *   isn't available, then recommends the closest matching tests we do offer
 *   (by fuzzy search first, Gemini only if that finds nothing).
 * Null when the question isn't an availability question about a named test.
 */
export async function answerAvailability(
  question: string,
  catalog: PricedCatalog,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<AvailabilityResponse | null> {
  if (detectSubject(question) !== "availability") return null;
  const name = testNameIn(question)
    .split(" ")
    .filter((word) => !AVAILABILITY_WORD.test(word))
    .join(" ");
  if (!name) return null;

  const found = await resolveNamedItems(name, catalog, false);
  const available = found.filter((item) => item.availability === "available");
  const base = { lookupQuery: name, engine: "builtin" as const, sources: [], intent: "Availability question" };

  if (found.length > 0 && available.length === found.length) {
    const reply =
      found.length === 1
        ? `Hi! Yes, ${priceLine(found[0]).replace(" – ", " is available – ")}.`
        : `Hi! Yes, these are available:\n\n${found.map((item) => `• ${priceLine(item)}`).join("\n")}`;
    return {
      ...base,
      kind: "test_question",
      answer: { subject: "availability", verdict: "yes", text: reply.replace(/^Hi! /, "") },
      reply,
      results: toDetailSuggestions(found),
      topic: found.map((item) => item.name).join(", "),
    };
  }

  // The exact test isn't available: say so, then recommend close matches.
  const unavailable = found.filter((item) => item.availability !== "available");
  const asked =
    unavailable.length > 0
      ? `${unavailable.map(customerName).join(", ")} ${unavailable.length === 1 ? "is" : "are"} currently ${AVAILABILITY_LABELS[unavailable[0].availability].toLowerCase()}`
      : `the exact test you asked for (${name}) isn't available with us`;
  const exclude = new Set(found.map(suggestionKey));
  const alternatives = (await similarItems(name, catalog, locationId, serviceTypes))
    .filter((item) => item.availability === "available" && !exclude.has(suggestionKey(item)))
    .slice(0, MAX_ALTERNATIVES)
    // Tests, then profiles, then packages.
    .sort((a, b) => listOrder(a) - listOrder(b));

  const reply =
    alternatives.length > 0
      ? `Hi! Sorry, ${asked}. Here are similar tests we offer:\n\n${alternatives.map((item) => `• ${priceLine(item)}`).join("\n")}`
      : `Hi! Sorry, ${asked}. Please let us know if you'd like help finding a similar test.`;

  return {
    ...base,
    kind: "test_question",
    answer: { subject: "availability", verdict: "no", text: reply.replace(/^Hi! /, "") },
    reply,
    results: alternatives.map((item, index) =>
      toSuggestion(item, { score: 0.9 - index * 0.01, level: "high", reason: `Similar to "${name}"` })
    ),
    topic: `Not available: ${name}`,
  };
}

/** Catalog items closest to a name: the fuzzy matcher's, or Gemini's when fuzzy finds nothing close. */
async function similarItems(
  name: string,
  catalog: PricedCatalog,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<PricedItem[]> {
  // The fuzzy matcher first (instant, no API request)…
  const [tests, aliases] = await Promise.all([listActiveTests(), listActiveAliases()]);
  const codeById = new Map(tests.map((test) => [test.id, test.code]));
  const fromFuzzy = rankResults(buildSearchCandidates(name, tests, aliases))
    .filter((candidate) => candidate.score >= SIMILAR_MIN_SCORE)
    .map((candidate) => findPriced(catalog, codeById.get(candidate.testId) ?? ""))
    .filter((item): item is PricedItem => Boolean(item));
  if (fromFuzzy.length > 0) return fromFuzzy;

  // …and Gemini only when fuzzy found nothing close.
  const codes = await aiSearchCatalog(name, locationId, serviceTypes, true).catch(() => null);
  return (codes ?? "")
    .split("\n")
    .map((code) => findPriced(catalog, code))
    .filter((item): item is PricedItem => Boolean(item));
}
