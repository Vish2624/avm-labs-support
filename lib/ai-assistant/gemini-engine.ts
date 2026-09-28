import "server-only";
import { findPriced, suggestionKey, toSuggestion, type PricedCatalog } from "./priced-catalog";
import { geminiGenerate, geminiReaderConfigured, READER_MODELS } from "@/lib/ai/gemini";
import { CUSTOMER_LABELS, SHORT_NOTICE, customerName } from "./customer-labels";
import type { AiAnswer, AiSource, AiSuggestion, TestQuestionSubject } from "@/types/ai-assistant";

/** Same fast models as the readers, with more time: the reply is a longer JSON object. */
const ASSISTANT_MODELS = READER_MODELS.map((entry) => ({ ...entry, timeoutMs: entry.timeoutMs + 6_000 }));
/** Below this 0-1 relevance a pick isn't shown at all; at or above HIGH it's "Highly relevant". */
const MIN_SCORE = 0.5;
const HIGH_SCORE = 0.75;
const MAX_RESULTS = 12;

export function geminiConfigured(): boolean {
  return geminiReaderConfigured("assistant");
}

export interface GeminiResult {
  requestType: "recommendation" | "direct_lookup" | "general_question" | "not_a_test_request";
  lookupQuery: string | null;
  /** The written reply to a general_question. */
  answer: string | null;
  /** The ready-to-send customer reply (null for a direct lookup). */
  reply: string | null;
  topic: string | null;
  intent: string | null;
  results: AiSuggestion[];
  unavailable: string[];
  sources: AiSource[];
}

interface GeminiJson {
  request_type?: unknown;
  lookup_query?: unknown;
  answer?: unknown;
  reply?: unknown;
  topic?: unknown;
  intent?: unknown;
  results?: { code?: unknown; relevance_score?: unknown; reason?: unknown }[];
  missing_relevant_tests?: unknown;
}

const INSTRUCTIONS = `You help the internal quotation team of a diagnostic laboratory. A team member pastes a customer's question; you identify which tests FROM THE LAB'S CATALOG BELOW are medically relevant to it.

Base your picks on current, reputable clinical guidance (e.g. NHS, CDC, Mayo Clinic, endocrine/diabetes societies) for which laboratory tests are commonly considered for the topic.

Rules:
- Only return codes that appear in the catalog below, copied exactly. Never invent a test, code or price.
- Understand meaning, intent, typos, abbreviations and synonyms. Never treat the whole sentence as a test name.
- Only include tests with a direct, commonly accepted clinical link to the question. Do not include a test just because it sounds similar (e.g. never AMH for a weight-loss question unless fertility/ovarian reserve is mentioned).
- Prefer a catalog package (e.g. Lipid Profile, Liver Function Tests, Kidney Function Tests) over listing its individual component tests.
- relevance_score: 0.75-1 = highly relevant, 0.5-0.74 = may be relevant. Omit anything weaker. Return at most 12, best first.
- reason: what the test checks, in 2-5 plain lowercase words a customer understands, e.g. "iron stores", "thyroid function", "3-month average blood sugar". No diagnosis, no medicine advice, no "you need".
- If the question simply names one specific test or asks its price/TAT/availability (e.g. "price of HbA1c"), set request_type "direct_lookup" and lookup_query to that test name, with no results.
- Any request for which tests to do — for a symptom, condition, checkup or purpose ("which tests for hair fall?", "diabetes checkup", "tests before starting gym") — is request_type "recommendation", never "general_question".
- If it is any other question about blood/lab tests, results or sample collection — what a test is or why it is done, normal/reference ranges, what a high or low value can mean, sample type, preparation, how often to test, the difference between tests, which test to choose, in any wording or language — set request_type "general_question": write "answer" and put the catalog tests it is about (or that fit it) in "results".
- "answer" (general_question only): a clear, plain reply for a support agent to pass on — 2-6 short sentences, or short "- " lines for lists. Reference ranges vary by lab, age and sex: say they are typical. No diagnosis, no prescription or medicine advice; for interpreting a patient's own result, advise consulting their doctor. Do not mention prices, report times or availability.
- If it is not about health or lab tests at all (including greetings, thanks and small talk), set request_type "not_a_test_request".
- missing_relevant_tests: plain names of clearly relevant tests you could not find in the catalog (max 5).
- "reply": ALWAYS write the message the agent can send the customer on WhatsApp — friendly, short, plain words:
  - recommendation: null (the system writes it from your results, "topic" and reasons — so make "topic" a plain phrase like "hair loss" or "a diabetes checkup").
  - general_question: "Hi! " then the answer in 1-4 short sentences (or "• " lines); end with "\\n\\n${SHORT_NOTICE}" only when it touches on health or results.
  - not_a_test_request: a natural reply — a greeting back ("Hi! How can I help you today?"), "You're welcome!", or politely say you can help with lab tests and health checkups.
  - direct_lookup: null (the system writes it from its records).
  Never mention prices, report times or availability in "reply".

Reply with ONLY this JSON object, no markdown:
{"request_type":"recommendation"|"direct_lookup"|"general_question"|"not_a_test_request","lookup_query":string|null,"answer":string|null,"reply":string|null,"topic":string,"intent":string,"results":[{"code":string,"relevance_score":number,"reason":string}],"missing_relevant_tests":[string]}
"topic" is a short label (e.g. "Weight management"); "intent" is the purpose (e.g. "Checks before starting medication").`;

function catalogListing(catalog: PricedCatalog): string {
  return catalog.items
    .map((item) =>
      item.kind === "package"
        ? `${item.code} | ${item.name} | package: ${item.tests.map((test) => test.officialName).join(", ")}`
        : `${item.code} | ${item.name}`
    )
    .join("\n");
}

function parseJson(text: string): GeminiJson {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini reply had no JSON");
  return JSON.parse(text.slice(start, end + 1)) as GeminiJson;
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Price, discount, availability and report-time claims — facts that must
 * only ever come from our own records (the DB), never from Gemini's own
 * words. Gemini is told not to write them; this guard makes sure.
 */
const RECORDS_ONLY_FACTS = new RegExp(
  [
    String.raw`\b(aed|sar|bhd|usd|dhs?|dirhams?|riyals?|dinars?|fils|halalas?)\b`,
    String.raw`\d+\s*(%|percent)`,
    String.raw`\b(discount\w*|offers?|promo\w*|coupon\w*|deals?|free of charge|for free|cheap\w*|expensive)\b`,
    String.raw`\b(price[ds]?|pricing|costs?|costing|charges?|fees?)\b`,
    String.raw`\b(is|are|isn't|aren't|not|currently|now)\s+(un)?available\b`,
    String.raw`\b(in|out of)\s+stock\b`,
    String.raw`\bwe\s+(do\s+not|don't|do|also)?\s*(have|offer|provide|do)\b`,
    String.raw`\b(ready|results?|reports?)\s+(in|within|by|after)\s+\d`,
    String.raw`\b(takes?|within|about|around)\s+\d+\s*(-\s*\d+\s*)?(hours?|hrs?|days?)\s+(for|to get|until)\b`,
  ].join("|"),
  "i"
);

/** Gemini's text, or null when it states something only our records may state. */
function recordsSafe(text: string | null): string | null {
  return text && !RECORDS_ONLY_FACTS.test(text) ? text : null;
}

/** Sent instead of a Gemini reply that tried to state a price/availability of its own. */
const RECORDS_FALLBACK_REPLY =
  "Hi! Please let us know which test or package you're interested in, and we'll share the exact price and details.";

/**
 * One Gemini call on the shared fast models (lib/ai/gemini.ts). Google
 * Search grounding is not used: on the free-tier key it answers 429
 * "quota exceeded" every time, which made every assistant question fail
 * over to the built-in guide. So `sources` is always empty.
 */
async function callGemini(system: string, user: string): Promise<{ text: string; sources: AiSource[] }> {
  const text = await geminiGenerate([{ text: `${system}\n\n${user}` }], ASSISTANT_MODELS, "assistant");
  if (text === null) throw new Error("Gemini did not answer");
  return { text, sources: [] };
}

const TEST_QUESTION_INSTRUCTIONS = `You help the internal team of a diagnostic laboratory answer a customer's question about specific lab tests (e.g. "Does the thyroid test need fasting?").

Base the answer on reputable sources (e.g. major lab test directories, NHS, MedlinePlus, Lab Tests Online) for standard patient preparation and what the test is for.

Rules:
- Answer only about the tests listed. Never give a diagnosis, prescription or medicine advice.
- For yes/no questions set "verdict" to "yes", "no", or "depends" (different tests differ, or it depends on the doctor's instructions); otherwise null.
- "answer": 1-3 short, plain sentences for a support agent, naming each test (e.g. "TSH: No fasting needed; a morning sample is common.").
- Do not mention prices, report times or availability — those come from the lab's own records.
- "reply": the same answer as a friendly WhatsApp message the agent can send the customer: "Hi! " then 1-3 short sentences in plain words.

Reply with ONLY this JSON object, no markdown:
{"verdict":"yes"|"no"|"depends"|null,"answer":string,"reply":string}`;

/** Gemini's grounded reply to a question about named catalog tests (fasting, what it's for). */
export async function answerTestQuestionWithGemini(
  question: string,
  subject: TestQuestionSubject,
  items: AiSuggestion[]
): Promise<{ answer: AiAnswer; reply: string | null; sources: AiSource[] }> {
  const listed = items
    .map((item) =>
      item.kind === "package"
        ? `${item.name} (package: ${item.tests.map((test) => test.officialName).join(", ")})`
        : `${item.name} (${item.code})`
    )
    .join("\n");
  const { text, sources } = await callGemini(TEST_QUESTION_INSTRUCTIONS, `Tests:\n${listed}\n\nQuestion: ${question}`);
  const json = parseJson(text) as { verdict?: unknown; answer?: unknown; reply?: unknown };
  // An answer that states a price/availability/report time of its own is
  // thrown away — the built-in answer from our records is used instead.
  const answerText = recordsSafe(str(json.answer));
  if (!answerText) throw new Error("Gemini gave no usable answer");
  const verdict = json.verdict === "yes" || json.verdict === "no" || json.verdict === "depends" ? json.verdict : null;
  return { answer: { subject, verdict, text: answerText }, reply: recordsSafe(str(json.reply)), sources };
}

/** Most tests named in a recommendation reply — the rest are still listed below it to tick. */
const MAX_REPLY_TESTS = 6;

/**
 * "Hi! Tests commonly considered for hair loss:\n\n• Ferritin – iron stores
 * …\n\nNote: …" — written from the priced picks themselves (customer-friendly
 * catalog names + Gemini's short reason), so the reply only ever names real
 * tests from our list. Null when nothing relevant was found.
 */
function recommendationReply(topic: string | null, results: AiSuggestion[]): string | null {
  const picks = results.filter((item) => item.relevanceLevel === "high");
  const listed = (picks.length > 0 ? picks : results).slice(0, MAX_REPLY_TESTS);
  if (listed.length === 0) return null;
  const about = topic ? ` for ${topic.charAt(0).toLowerCase()}${topic.slice(1)}` : "";
  const lines = listed.map((item) => {
    const checks = CUSTOMER_LABELS[item.code.toUpperCase()]?.[1] ?? item.reason.charAt(0).toLowerCase() + item.reason.slice(1);
    return `• ${customerName(item)} – ${checks}`;
  });
  return [`Hi! Tests commonly considered${about}:`, "", ...lines, "", SHORT_NOTICE].join("\n");
}

/**
 * Asks Gemini, grounded with Google Search, which catalog items fit the
 * question. Gemini only returns codes + reasons; each code is looked up in
 * the priced catalog and silently dropped if it isn't there, so the model
 * can't add a test, code, price or TAT of its own.
 */
export async function recommendWithGemini(question: string, catalog: PricedCatalog): Promise<GeminiResult> {
  const { text, sources } = await callGemini(
    `${INSTRUCTIONS}\n\nCATALOG (code | name):\n${catalogListing(catalog)}`,
    `Customer question: ${question}`
  );
  const json = parseJson(text);

  const requestType =
    json.request_type === "direct_lookup" ||
    json.request_type === "general_question" ||
    json.request_type === "not_a_test_request"
      ? json.request_type
      : "recommendation";

  const byKey = new Map<string, AiSuggestion>();
  for (const pick of Array.isArray(json.results) ? json.results : []) {
    const code = str(pick.code);
    const score = typeof pick.relevance_score === "number" ? Math.min(Math.max(pick.relevance_score, 0), 1) : 0;
    if (!code || score < MIN_SCORE) continue;
    const priced = findPriced(catalog, code);
    if (!priced || byKey.has(suggestionKey(priced))) continue;
    byKey.set(
      suggestionKey(priced),
      toSuggestion(priced, {
        score: Math.round(score * 100) / 100,
        level: score >= HIGH_SCORE ? "high" : "medium",
        reason: (str(pick.reason) ?? "Related to the question").slice(0, 120),
      })
    );
  }
  const results = [...byKey.values()].sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, MAX_RESULTS);

  return {
    requestType,
    lookupQuery: str(json.lookup_query),
    answer: requestType === "general_question" ? recordsSafe(str(json.answer)) : null,
    // The recommendation reply is built from DB records; any reply Gemini
    // wrote itself is dropped if it states a price/availability/report time.
    reply:
      requestType === "direct_lookup"
        ? null
        : requestType === "recommendation"
          ? recommendationReply(str(json.topic), results)
          : str(json.reply) && (recordsSafe(str(json.reply)) ?? RECORDS_FALLBACK_REPLY),
    topic: str(json.topic),
    intent: str(json.intent),
    results: requestType === "recommendation" || requestType === "general_question" ? results : [],
    unavailable: Array.isArray(json.missing_relevant_tests)
      ? json.missing_relevant_tests.filter((name): name is string => typeof name === "string").slice(0, 5)
      : [],
    sources,
  };
}
