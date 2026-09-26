import "server-only";
import { findPriced, suggestionKey, toSuggestion, type PricedCatalog } from "./priced-catalog";
import type { AiAnswer, AiSource, AiSuggestion, TestQuestionSubject } from "@/types/ai-assistant";

const DEFAULT_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 30_000;
/** Below this 0-1 relevance a pick isn't shown at all; at or above HIGH it's "Highly relevant". */
const MIN_SCORE = 0.5;
const HIGH_SCORE = 0.75;
const MAX_RESULTS = 12;
const MAX_SOURCES = 5;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface GeminiResult {
  requestType: "recommendation" | "direct_lookup" | "general_question" | "not_a_test_request";
  lookupQuery: string | null;
  /** The written reply to a general_question. */
  answer: string | null;
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
  topic?: unknown;
  intent?: unknown;
  results?: { code?: unknown; relevance_score?: unknown; reason?: unknown }[];
  missing_relevant_tests?: unknown;
}

const INSTRUCTIONS = `You help the internal quotation team of a diagnostic laboratory. A team member pastes a customer's question; you identify which tests FROM THE LAB'S CATALOG BELOW are medically relevant to it.

Use Google Search to check current, reputable clinical guidance (e.g. NHS, CDC, Mayo Clinic, endocrine/diabetes societies) for which laboratory tests are commonly considered for the topic.

Rules:
- Only return codes that appear in the catalog below, copied exactly. Never invent a test, code or price.
- Understand meaning, intent, typos, abbreviations and synonyms. Never treat the whole sentence as a test name.
- Only include tests with a direct, commonly accepted clinical link to the question. Do not include a test just because it sounds similar (e.g. never AMH for a weight-loss question unless fertility/ovarian reserve is mentioned).
- Prefer a catalog package (e.g. Lipid Profile, Liver Function Tests, Kidney Function Tests) over listing its individual component tests.
- relevance_score: 0.75-1 = highly relevant, 0.5-0.74 = may be relevant. Omit anything weaker. Return at most 12, best first.
- reason: one short neutral phrase (max 10 words), e.g. "Blood glucose assessment". No diagnosis, no medicine advice, no "you need".
- If the question simply names one specific test or asks its price/TAT/availability (e.g. "price of HbA1c"), set request_type "direct_lookup" and lookup_query to that test name, with no results.
- If it is any other question about blood/lab tests, results or sample collection — what a test is or why it is done, normal/reference ranges, what a high or low value can mean, sample type, preparation, how often to test, the difference between tests, which test to choose, in any wording or language — set request_type "general_question": write "answer" and put the catalog tests it is about (or that fit it) in "results".
- "answer" (general_question only): a clear, plain reply for a support agent to pass on — 2-6 short sentences, or short "- " lines for lists. Reference ranges vary by lab, age and sex: say they are typical. No diagnosis, no prescription or medicine advice; for interpreting a patient's own result, advise consulting their doctor. Do not mention prices, report times or availability.
- If it is not about health or lab tests at all, set request_type "not_a_test_request".
- missing_relevant_tests: plain names of clearly relevant tests you could not find in the catalog (max 5).

Reply with ONLY this JSON object, no markdown:
{"request_type":"recommendation"|"direct_lookup"|"general_question"|"not_a_test_request","lookup_query":string|null,"answer":string|null,"topic":string,"intent":string,"results":[{"code":string,"relevance_score":number,"reason":string}],"missing_relevant_tests":[string]}
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

/** One grounded generateContent call: the reply text plus the Google Search pages it cited. */
async function callGemini(system: string, user: string): Promise<{ text: string; sources: AiSource[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
  };
  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");

  const sources: AiSource[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (uri && !sources.some((source) => source.uri === uri)) sources.push({ uri, title: chunk.web?.title || uri });
  }
  return { text, sources: sources.slice(0, MAX_SOURCES) };
}

const TEST_QUESTION_INSTRUCTIONS = `You help the internal team of a diagnostic laboratory answer a customer's question about specific lab tests (e.g. "Does the thyroid test need fasting?").

Use Google Search to check reputable sources (e.g. major lab test directories, NHS, MedlinePlus, Lab Tests Online) for standard patient preparation and what the test is for.

Rules:
- Answer only about the tests listed. Never give a diagnosis, prescription or medicine advice.
- For yes/no questions set "verdict" to "yes", "no", or "depends" (different tests differ, or it depends on the doctor's instructions); otherwise null.
- "answer": 1-3 short, plain sentences for a support agent, naming each test (e.g. "TSH: No fasting needed; a morning sample is common.").
- Do not mention prices, report times or availability — those come from the lab's own records.

Reply with ONLY this JSON object, no markdown:
{"verdict":"yes"|"no"|"depends"|null,"answer":string}`;

/** Gemini's grounded reply to a question about named catalog tests (fasting, what it's for). */
export async function answerTestQuestionWithGemini(
  question: string,
  subject: TestQuestionSubject,
  items: AiSuggestion[]
): Promise<{ answer: AiAnswer; sources: AiSource[] }> {
  const listed = items
    .map((item) =>
      item.kind === "package"
        ? `${item.name} (package: ${item.tests.map((test) => test.officialName).join(", ")})`
        : `${item.name} (${item.code})`
    )
    .join("\n");
  const { text, sources } = await callGemini(TEST_QUESTION_INSTRUCTIONS, `Tests:\n${listed}\n\nQuestion: ${question}`);
  const json = parseJson(text) as { verdict?: unknown; answer?: unknown };
  const answerText = str(json.answer);
  if (!answerText) throw new Error("Gemini gave no answer");
  const verdict = json.verdict === "yes" || json.verdict === "no" || json.verdict === "depends" ? json.verdict : null;
  return { answer: { subject, verdict, text: answerText }, sources };
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
    answer: requestType === "general_question" ? str(json.answer) : null,
    topic: str(json.topic),
    intent: str(json.intent),
    results: requestType === "recommendation" || requestType === "general_question" ? results : [],
    unavailable: Array.isArray(json.missing_relevant_tests)
      ? json.missing_relevant_tests.filter((name): name is string => typeof name === "string").slice(0, 5)
      : [],
    sources,
  };
}
