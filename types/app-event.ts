/**
 * - gemini_error: a Gemini request failed (bad response, server error).
 * - gemini_timeout: a Gemini request took too long and was abandoned.
 * - gemini_quota: a Gemini key hit its (free-tier) limit — HTTP 429.
 * - gemini_unavailable: every key/model failed, so the feature fell back.
 * - fallback: a feature used its basic backup instead of Gemini.
 * - error: anything else that went wrong while serving an agent.
 */
export type AppEventKind = "gemini_error" | "gemini_timeout" | "gemini_quota" | "gemini_unavailable" | "fallback" | "error";

/** Which Gemini key (see lib/ai/gemini.ts). */
export type AppEventKeyRole = "reader" | "image" | "search" | "assistant";

/** One problem recorded for Admin > System health (lib/database/app-events.ts). */
export interface AppEvent {
  id: string;
  kind: AppEventKind;
  feature: string;
  keyRole: AppEventKeyRole | null;
  message: string;
  detail: string | null;
  createdAt: string;
}
