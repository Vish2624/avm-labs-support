/**
 * Which feature a Gemini key serves first (see lib/ai/gemini.ts):
 * - reader: "Paste text or image" — pasted messages
 * - image: "Paste text or image" — prescription photos
 * - search: the search box's AI matches
 * - assistant: the Support Assistant
 * - shared: any feature, before it borrows another feature's key
 * - backup: any feature, last of all
 */
export type ApiKeyRole = "reader" | "image" | "search" | "assistant" | "shared" | "backup";

export const API_KEY_ROLES: readonly ApiKeyRole[] = ["reader", "image", "search", "assistant", "shared", "backup"];

export const API_KEY_ROLE_LABELS: Record<ApiKeyRole, string> = {
  reader: "Paste text",
  image: "Prescription images",
  search: "Search tests (AI)",
  assistant: "Support Assistant",
  shared: "Shared — any feature",
  backup: "Backup — last resort",
};

/** A Gemini key the app can use (api_keys table). The secret itself never leaves the server. */
export interface ApiKey {
  id: string;
  label: string;
  role: ApiKeyRole;
  /** Set for a key kept in a Vercel environment variable; null for one added on the page. */
  envName: string | null;
  /** Last 4 characters of the key, for telling keys apart ("…a1B2"); null when an env key isn't set. */
  hint: string | null;
  dailyLimit: number | null;
  active: boolean;
  createdAt: string;
}

/** What happened to one request sent to Gemini. */
export type ApiCallOutcome = "ok" | "quota" | "error" | "timeout" | "network" | "empty" | "cancelled";

/** One request sent to Gemini (api_calls table). */
export interface ApiCall {
  keyId: string | null;
  feature: string;
  model: string;
  outcome: ApiCallOutcome;
  httpStatus: number | null;
  latencyMs: number;
  createdAt: string;
}
