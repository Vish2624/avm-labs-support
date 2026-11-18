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

/** Blood collection tubes: set per test on the website, else by general lab practice. */
export type SampleTube = "EDTA" | "Serum" | "Fluoride" | "Citrate" | "Heparin";

/** One sample a test or package needs, with the tests collected in it. */
export interface SampleNeed {
  /** "Blood", "Urine"… — from our records (the website). */
  specimen: string;
  /** For blood: the tube set on the website, else the usual one by lab practice; null otherwise. */
  tube: SampleTube | null;
  /** The tests collected in this sample (a test: itself; a package: its tests). */
  tests: string[];
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
  /** Fasting — from our records when the website sent it, else the built-in guide (null = unknown). */
  fasting: FastingInfo | null;
  /** The samples to collect, one per specimen/tube (empty = not in our records). */
  samples: SampleNeed[];
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
 * "sample" = which sample/tube a test needs ("EDTA or serum for CBC?").
 * "details" = everything we have on the tests (price, report time, sample, fasting).
 * "general" = any other blood-test question (normal range, what high/low means, purpose…).
 * "profile_match" = which profile/package covers a list of tests ("profile with cbc, tsh and vit d").
 */
export type TestQuestionSubject =
  | "fasting"
  | "sample"
  | "components"
  | "price"
  | "tat"
  | "availability"
  | "details"
  | "general"
  | "profile_match";

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
  /**
   * A ready-to-send, WhatsApp-style reply to the question ("Hi! Tests
   * commonly considered for hair loss: …", "Hi! How can I help you?").
   * Written by Gemini, or built from DB fields for price/report-time/
   * availability/parameter questions. Null when neither could (the client
   * then builds a message from the ticked tests).
   */
  reply: string | null;
  /** Clinically relevant tests the assistant looked for but the catalog doesn't sell here. */
  unavailableNote: string | null;
  /** Which engine answered: Gemini with Google Search, or the built-in topic guide. */
  engine: "gemini" | "builtin";
  /** Google Search pages the Gemini answer was grounded on (empty for the built-in guide). */
  sources: AiSource[];
  warning: string;
}
