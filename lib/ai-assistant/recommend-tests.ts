import "server-only";
import { normalizeQuery } from "@/lib/search/matching/normalize-query";
import { listOrder, loadPricedCatalog, type PricedCatalog } from "./priced-catalog";
import { correctSpelling } from "./spell-correct";
import { asksBeforeTreatment, matchTopics, recommendFromGuide } from "./builtin-engine";
import {
  answerTestQuestionWithGemini,
  fastingPerTestWithGemini,
  geminiConfigured,
  recommendWithGemini,
} from "./gemini-engine";
import { answerAvailability } from "./availability-answer";
import { asksForProfile, findProfilesFor, perTestFasting, perTestTat, resolveTestGroup } from "./test-group";
import { recordAppEvent } from "@/lib/database/app-events";
import {
  builtinAnswer,
  componentsAnswer,
  detectSubject,
  namesPackageExactly,
  recordsReply,
  resolveNamedItems,
  testNameIn,
  toDetailSuggestions,
} from "./test-question";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AiAssistantResponse, AiSource, TestQuestionSubject } from "@/types/ai-assistant";

export const MEDICAL_NOTICE =
  "These are informational test suggestions based on your question and are not a medical diagnosis or prescription. The appropriate tests depend on your individual history, symptoms, medications and clinical assessment. Please consult a qualified healthcare professional before starting, stopping or changing any medication.";

const UNAVAILABLE_NOTE = "Some clinically relevant tests may not be available in our current test list.";
/** A question this short with no topic and no question words may just be a test name ("hba1c", "lipid profile"). */
const SHORT_QUESTION_WORDS = 4;

/** Asking which tests to do ("which tests for…", "what test should", "suggest tests") — a recommendation request. */
const RECOMMENDATION_ASK = /\b(which|what)\s+(tests?|checks?|checkups?|investigations?)\b|\btests?\s+(for|to (do|take|check))\b|\b(suggest|recommend)\w*/;

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
): Promise<Pick<
  AiAssistantResponse,
  "kind" | "lookupQuery" | "answer" | "reply" | "results" | "engine" | "sources" | "topic" | "intent"
> | null> {
  let subject: TestQuestionSubject | null = forcedName ? "details" : detectSubject(question);
  const name = forcedName ? normalizeQuery(forcedName) : testNameIn(question);
  if (!name) return null;

  // A package named in full ("lipid profile", "avm diabetic profile 1.2
  // tests") with no other question -> the tests it includes.
  if (!subject && namesPackageExactly(name, catalog)) subject = "components";
  if (!subject) {
    // No question words: only a short, bare test name counts ("hba1c").
    const bare =
      normalizeQuery(question).split(" ").length <= SHORT_QUESTION_WORDS &&
      matchTopics(question).length === 0 &&
      !asksBeforeTreatment(question);
    if (!bare) return null;
  }

  // "Which tests for tiredness and hair fall?" asks for recommendations, even
  // when it happens to contain a word like "eat" or "water": a fasting
  // answer only fits when a test is actually named.
  const asksWhichTests = RECOMMENDATION_ASK.test(normalizeQuery(question));
  if (subject === "fasting" && asksWhichTests && (await resolveNamedItems(name, catalog, false)).length === 0) return null;

  // "Does sugar test need fasting?" names its tests loosely — its topic's
  // main tests answer it. A price/TAT question about a topic ("price of
  // diabetes tests") is better served by recommendations.
  const items = await resolveNamedItems(name, catalog, subject === "fasting" && !asksWhichTests);
  if (items.length === 0) return null;

  const results = toDetailSuggestions(items);
  const effectiveSubject = subject ?? "details";
  // Parameters come only from our own records: a package's tests, or the
  // package stored under the same code/name as a test (CBC -> Hemogram).
  let answer = effectiveSubject === "components" ? await componentsAnswer(results) : builtinAnswer(effectiveSubject, results);
  let engine: AiAssistantResponse["engine"] = "builtin";
  let sources: AiSource[] = [];
  let reply: string | null = null;

  // Fasting/what-is questions can use Gemini + Google Search; price, TAT and
  // availability always come straight from our own records.
  if ((effectiveSubject === "fasting" || (effectiveSubject === "details" && subject === null && !forcedName)) && (await geminiConfigured())) {
    try {
      const gemini = await answerTestQuestionWithGemini(question, effectiveSubject, results);
      answer = gemini.answer;
      reply = gemini.reply;
      sources = gemini.sources;
      engine = "gemini";
    } catch (error) {
      recordAppEvent({
        kind: "fallback",
        feature: "assistant",
        message: "Test question answered from the built-in guide (Gemini's answer was unusable)",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    kind: "test_question",
    lookupQuery: name,
    answer,
    reply: reply ?? recordsReply(effectiveSubject, results, answer),
    results,
    engine,
    sources,
    topic: results.map((item) => item.name).join(", "),
    intent: {
      fasting: "Fasting / preparation question",
      components: "Parameters included",
      price: "Price question",
      tat: "Report time question",
      availability: "Availability question",
      details: "Test details",
      general: "Blood test question",
      profile_match: "Profile for these tests",
    }[effectiveSubject],
  };
}

/**
 * A question naming several tests at once — "which profile has CBC, TSH and
 * Vit D?", "fasting for CBC, lipid profile, HbA1c?", "TAT for all these:
 * …". Answered per test (or by the profile finder), never as one merged
 * answer. Null when it isn't a list question.
 */
async function answerTestGroup(
  rawQuestion: string,
  question: string,
  catalog: PricedCatalog
): Promise<Pick<
  AiAssistantResponse,
  "kind" | "lookupQuery" | "answer" | "reply" | "results" | "engine" | "sources" | "topic" | "intent"
> | null> {
  const group = await resolveTestGroup(rawQuestion, catalog);
  if (group.items.length === 0 || group.items.length + group.notFound.length < 2) return null;
  const subject = detectSubject(question);
  const base = { kind: "test_question" as const, lookupQuery: null, sources: [] };

  if (subject !== "fasting" && subject !== "tat" && asksForProfile(question, group)) {
    const found = findProfilesFor(group, catalog);
    return { ...base, ...found, engine: "builtin", intent: "Profile for these tests" };
  }
  if (group.items.length < 2) return null;
  const results = toDetailSuggestions(group.items);
  const topic = results.map((item) => item.name).join(", ");

  if (subject === "tat") {
    return { ...base, ...perTestTat(results, group.notFound), results, topic, engine: "builtin", intent: "Report time for each test" };
  }
  if (subject === "fasting") {
    let engine: AiAssistantResponse["engine"] = "builtin";
    const unknown = results.filter((item) => !item.fasting);
    if (unknown.length > 0 && (await geminiConfigured())) {
      try {
        const answers = await fastingPerTestWithGemini(unknown);
        for (const item of unknown) item.fasting = answers.get(item.code.toUpperCase()) ?? null;
        if (answers.size > 0) engine = "gemini";
      } catch (error) {
        recordAppEvent({
          kind: "fallback",
          feature: "assistant",
          message: "Per-test fasting answered from the built-in guide only (Gemini's answer was unusable)",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ...base, ...perTestFasting(results, group.notFound), results, topic, engine, intent: "Fasting for each test" };
  }
  return null;
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
  rawQuestion: string,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<AiAssistantResponse> {
  const base = { query: rawQuestion, warning: MEDICAL_NOTICE, unavailableNote: null, reply: null };
  const catalog = await loadPricedCatalog(locationId, serviceTypes);
  // The built-in rules read the spell-corrected question ("lipd profle" ->
  // "lipid profile"); Gemini gets the agent's own words and copes with typos.
  const question = await correctSpelling(rawQuestion, catalog);

  // Several tests named at once: per-test fasting/report time, or the
  // profile that covers them.
  const testGroup = await answerTestGroup(rawQuestion, question, catalog);
  if (testGroup) return { ...base, ...testGroup };

  // "Is X available?" — a yes with price/report time, or "not available"
  // plus the closest tests we do offer. Only from our records.
  const availability = await answerAvailability(question, catalog, locationId, serviceTypes);
  if (availability) return { ...base, ...availability };

  const testQuestion = await answerTestQuestion(question, catalog, null);
  if (testQuestion) return { ...base, ...testQuestion };

  if (await geminiConfigured()) {
    try {
      const gemini = await recommendWithGemini(rawQuestion, catalog);
      if (gemini.requestType === "direct_lookup" && gemini.lookupQuery) {
        const lookup = await answerTestQuestion(question, catalog, gemini.lookupQuery);
        if (lookup) return { ...base, ...lookup, engine: "gemini" };
      }
      if (gemini.requestType === "general_question" && gemini.answer) {
        return {
          ...base,
          kind: "test_question",
          lookupQuery: null,
          answer: { subject: "general", verdict: null, text: gemini.answer },
          reply: gemini.reply,
          topic: gemini.topic,
          intent: gemini.intent,
          results: gemini.results,
          unavailableNote: null,
          engine: "gemini",
          sources: gemini.sources,
        };
      }
      return {
        ...base,
        kind: gemini.requestType === "recommendation" ? "recommendation" : "not_a_test_request",
        lookupQuery: null,
        answer: null,
        reply: gemini.reply,
        topic: gemini.topic,
        intent: gemini.intent,
        results: gemini.results,
        unavailableNote: unavailableNote(gemini.unavailable),
        engine: "gemini",
        sources: gemini.sources,
      };
    } catch (error) {
      // Fall through to the built-in guide — the agent still gets an answer.
      recordAppEvent({
        kind: "fallback",
        feature: "assistant",
        message: "Question answered from the built-in guide (Gemini's answer was unusable)",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const guide = recommendFromGuide(question, catalog);
  if (!guide.topicLabel) {
    // No topic and not a question type the guide knows: still show any test
    // the question names, so the agent isn't left with nothing.
    const items = await resolveNamedItems(testNameIn(question), catalog, false);
    if (items.length > 0) {
      const results = toDetailSuggestions(items);
      return {
        ...base,
        kind: "test_question",
        lookupQuery: testNameIn(question),
        answer: {
          subject: "general",
          verdict: null,
          text: "The built-in guide can't answer this kind of question in detail. Here is the test from our list — please confirm specifics with the lab team.",
        },
        topic: results.map((item) => item.name).join(", "),
        intent: "Test details",
        results,
        unavailableNote: null,
        engine: "builtin",
        sources: [],
      };
    }
  }
  return {
    ...base,
    kind: guide.topicLabel ? "recommendation" : "not_a_test_request",
    lookupQuery: null,
    answer: null,
    topic: guide.topicLabel,
    intent: guide.intent,
    // Tests, then profiles, then packages.
    results: [...guide.results].sort((a, b) => listOrder(a) - listOrder(b)),
    unavailableNote: unavailableNote(guide.unavailable),
    engine: "builtin",
    sources: [],
  };
}
