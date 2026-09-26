import type { Money } from "@/lib/pricing/money";
import type { ServiceType } from "@/lib/constants/service-types";
import type { AvailabilityStatus } from "@/lib/constants/availability";
import type { ProfileTestSummary } from "@/types/profile";

export type AiRelevanceLevel = "high" | "medium";

/** Patient preparation for a test — from the built-in guide or Gemini, never from the price list. */
export interface FastingInfo {
  required: "yes" | "no" | "recommended";
  note: string;
}

/**
 * One AI Test Assistant suggestion. The AI only ever supplies a catalog code
 * plus its reason/relevance; every other field (id, name, price, TAT,
 * availability, package roster) is read from the database by code — so a
 * suggestion can never carry an invented test, code or price.
 */
interface AiSuggestionBase {
  code: string;
  name: string;
  price: Money;
  tatText: string;
  availability: AvailabilityStatus;
  serviceType: ServiceType;
  /** 0-1, as ranked by the assistant. */
  relevanceScore: number;
  relevanceLevel: AiRelevanceLevel;
  reason: string;
  /** Fasting guidance when known (null = not in the guide). */
  fasting: FastingInfo | null;
}

export interface AiTestSuggestion extends AiSuggestionBase {
  kind: "test";
  testId: string;
}

/** Common panels (Lipid Profile, LFT, KFT…) are packages in the catalog. */
export interface AiPackageSuggestion extends AiSuggestionBase {
  kind: "package";
  profileId: string;
  tests: ProfileTestSummary[];
}

export type AiSuggestion = AiTestSuggestion | AiPackageSuggestion;

export interface AiSource {
  title: string;
  uri: string;
}

/**
 * "components" = which parameters/tests a test or package includes ("parameters in CBC").
 * "general" = any other blood-test question (normal range, what high/low means, sample, purpose…).
 */
export type TestQuestionSubject = "fasting" | "components" | "price" | "tat" | "availability" | "details" | "general";

/** The assistant's direct reply to a question about named test(s): "Does TSH need fasting?" -> No. */
export interface AiAnswer {
  subject: TestQuestionSubject;
  /** Yes/No headline for yes-no questions (fasting); null otherwise. */
  verdict: "yes" | "no" | "preferred" | "depends" | null;
  text: string;
}

export interface AiAssistantResponse {
  query: string;
  /**
   * "recommendation" — tests suggested for a need/symptom (possibly none).
   * "test_question" — a question about specific named test(s) (fasting,
   * price, report time, availability, or just a name): `answer` replies to
   * it and `results` are those tests' details; `lookupQuery` opens them in
   * the normal search.
   * "not_a_test_request" — nothing to recommend tests for.
   */
  kind: "recommendation" | "test_question" | "not_a_test_request";
  lookupQuery: string | null;
  answer: AiAnswer | null;
  /** Short label for what the question is about, e.g. "Weight management". */
  topic: string | null;
  /** What the customer wants, e.g. "Checks before starting medication". */
  intent: string | null;
  results: AiSuggestion[];
  /** Clinically relevant tests the assistant looked for but the catalog doesn't sell here. */
  unavailableNote: string | null;
  /** Which engine answered: Gemini with Google Search, or the built-in topic guide. */
  engine: "gemini" | "builtin";
  /** Google Search pages the Gemini answer was grounded on (empty for the built-in guide). */
  sources: AiSource[];
  warning: string;
}
