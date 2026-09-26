import "server-only";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { loadPricedCatalog, type PricedCatalog } from "./priced-catalog";
import { asksBeforeTreatment, matchTopics, recommendFromGuide } from "./builtin-engine";
import { answerTestQuestionWithGemini, geminiConfigured, recommendWithGemini } from "./gemini-engine";
import { builtinAnswer, detectSubject, resolveNamedItems, testNameIn, toDetailSuggestions } from "./test-question";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AiAssistantResponse, AiSource, TestQuestionSubject } from "@/types/ai-assistant";

export const MEDICAL_NOTICE =
  "These are informational test suggestions based on your question and are not a medical diagnosis or prescription. The appropriate tests depend on your individual history, symptoms, medications and clinical assessment. Please consult a qualified healthcare professional before starting, stopping or changing any medication.";

const UNAVAILABLE_NOTE = "Some clinically relevant tests may not be available in our current test list.";
/** A question this short with no topic and no question words may just be a test name ("hba1c", "lipid profile"). */
const SHORT_QUESTION_WORDS = 4;

function unavailableNote(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${UNAVAILABLE_NOTE} (${names.join(", ")})`;
}

/**
 * A question about specific named test(s) rather than a need to recommend
 * for: "does thyroid test need fasting?", "price of HbA1c", "how long for
 * vitamin d report?", or just "lipid profile". Replies with the answer and
 * those tests' DB details, or null when no test is confidently named.
 */
async function answerTestQuestion(
  question: string,
  catalog: PricedCatalog,
  forcedName: string | null
): Promise<Pick<AiAssistantResponse, "kind" | "lookupQuery" | "answer" | "results" | "engine" | "sources" | "topic" | "intent"> | null> {
  const subject: TestQuestionSubject | null = forcedName ? "details" : detectSubject(question);
  const name = forcedName ? normalizeQuery(forcedName) : testNameIn(question);
  if (!name) return null;

  if (!subject) {
    // No question words: only a short, bare test name counts ("hba1c").
    const bare =
      normalizeQuery(question).split(" ").length <= SHORT_QUESTION_WORDS &&
      matchTopics(question).length === 0 &&
      !asksBeforeTreatment(question);
    if (!bare) return null;
  }

  // "Does sugar test need fasting?" names its tests loosely — its topic's
  // main tests answer it. A price/TAT question about a topic ("price of
  // diabetes tests") is better served by recommendations.
  const items = await resolveNamedItems(name, catalog, subject === "fasting");
  if (items.length === 0) return null;

  const results = toDetailSuggestions(items);
  const effectiveSubject = subject ?? "details";
  let answer = builtinAnswer(effectiveSubject, results);
  let engine: AiAssistantResponse["engine"] = "builtin";
  let sources: AiSource[] = [];

  // Fasting/what-is questions can use Gemini + Google Search; price, TAT and
  // availability always come straight from our own records.
  if ((effectiveSubject === "fasting" || (effectiveSubject === "details" && subject === null && !forcedName)) && geminiConfigured()) {
    try {
      const gemini = await answerTestQuestionWithGemini(question, effectiveSubject, results);
      answer = gemini.answer;
      sources = gemini.sources;
      engine = "gemini";
    } catch (error) {
      console.error("[ai-assistant] Gemini test answer failed, using the built-in guide:", error);
    }
  }

  return {
    kind: "test_question",
    lookupQuery: name,
    answer,
    results,
    engine,
    sources,
    topic: results.map((item) => item.name).join(", "),
    intent: {
      fasting: "Fasting / preparation question",
      price: "Price question",
      tat: "Report time question",
      availability: "Availability question",
      details: "Test details",
    }[effectiveSubject],
  };
}

/**
 * The AI Test Assistant: turns a customer's natural-language question into
 * either a direct answer about named tests (fasting, price, report time)
 * or catalog tests/packages worth considering for their quotation.
 * Separate from the test search — it only reads the same catalog.
 *
 * Gemini (grounded with Google Search) answers when GEMINI_API_KEY is set;
 * otherwise, or if Gemini fails, the built-in guides do. Either way every
 * test shown is a catalog code resolved against this location's current
 * prices — never an invented test, code or price.
 */
export async function recommendTests(
  question: string,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<AiAssistantResponse> {
  const base = { query: question, warning: MEDICAL_NOTICE, unavailableNote: null };
  const catalog = await loadPricedCatalog(locationId, serviceTypes);

  const testQuestion = await answerTestQuestion(question, catalog, null);
  if (testQuestion) return { ...base, ...testQuestion };

  if (geminiConfigured()) {
    try {
      const gemini = await recommendWithGemini(question, catalog);
      if (gemini.requestType === "direct_lookup" && gemini.lookupQuery) {
        const lookup = await answerTestQuestion(question, catalog, gemini.lookupQuery);
        if (lookup) return { ...base, ...lookup, engine: "gemini" };
      }
      return {
        ...base,
        kind: gemini.requestType === "direct_lookup" ? "not_a_test_request" : gemini.requestType,
        lookupQuery: null,
        answer: null,
        topic: gemini.topic,
        intent: gemini.intent,
        results: gemini.results,
        unavailableNote: unavailableNote(gemini.unavailable),
        engine: "gemini",
        sources: gemini.sources,
      };
    } catch (error) {
      // Fall through to the built-in guide — the agent still gets an answer.
      console.error("[ai-assistant] Gemini failed, using the built-in guide:", error);
    }
  }

  const guide = recommendFromGuide(question, catalog);
  return {
    ...base,
    kind: guide.topicLabel ? "recommendation" : "not_a_test_request",
    lookupQuery: null,
    answer: null,
    topic: guide.topicLabel,
    intent: guide.intent,
    results: guide.results,
    unavailableNote: unavailableNote(guide.unavailable),
    engine: "builtin",
    sources: [],
  };
}
