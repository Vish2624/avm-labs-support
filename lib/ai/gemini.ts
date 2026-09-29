import "server-only";
import { recordAppEvent } from "@/lib/database/app-events";

/**
 * Plain Gemini generateContent calls for the Workspace's readers (pasted
 * text and prescription images). Runs on the free-tier GEMINI_API_KEY; the
 * text/image sent here goes to Google. Tries each model in turn, so a busy
 * or slow model (503s and long stalls happen on the free tier) falls back
 * to the next.
 */

export interface GeminiModelTry {
  model: string;
  /** Give up on this model after this long and try the next. */
  timeoutMs: number;
}

/**
 * Fastest first. Timed on this key (Sep 2026, same catalog-sized prompt):
 * 3.1 Flash Lite answered in 3-4 s; 3.5 Flash Lite in 10-14 s; the
 * "-latest" aliases were overloaded or timed out at 30 s.
 */
export const READER_MODELS: readonly GeminiModelTry[] = [
  { model: "gemini-3.1-flash-lite", timeoutMs: 9_000 },
  { model: "gemini-3.5-flash-lite", timeoutMs: 15_000 },
];

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/**
 * Which free-tier key (a separate Google account each, so a separate daily
 * quota) a feature uses first:
 * "reader" = pasted text (GEMINI_API_KEY);
 * "image" = prescription images (GEMINI_API_KEY_IMAGE);
 * "search" = the search box's AI matches (GEMINI_API_KEY_SEARCH);
 * "assistant" = the Support Assistant (GEMINI_API_KEY_ASSISTANT).
 * When a feature's own key is missing or fails (e.g. its quota ran out),
 * it borrows the others, in that order.
 */
export type GeminiKeyRole = "reader" | "image" | "search" | "assistant";

const KEY_ENV: Record<GeminiKeyRole, string> = {
  reader: "GEMINI_API_KEY",
  image: "GEMINI_API_KEY_IMAGE",
  search: "GEMINI_API_KEY_SEARCH",
  assistant: "GEMINI_API_KEY_ASSISTANT",
};

/** The keys to try for a feature — its own first, then the others — with which role each key belongs to. */
function keysFor(role: GeminiKeyRole): { keyRole: GeminiKeyRole; apiKey: string }[] {
  const order = [role, ...(Object.keys(KEY_ENV) as GeminiKeyRole[]).filter((other) => other !== role)];
  const seen = new Set<string>();
  return order.flatMap((keyRole) => {
    const apiKey = process.env[KEY_ENV[keyRole]];
    if (!apiKey || seen.has(apiKey)) return [];
    seen.add(apiKey);
    return [{ keyRole, apiKey }];
  });
}

/** The feature name each role stands for on Admin > System health. */
const FEATURE: Record<GeminiKeyRole, string> = {
  reader: "paste",
  image: "image",
  search: "search",
  assistant: "assistant",
};

/** Whether the feature's *own* key is set (it can still borrow others) — for Admin > System health. */
export function geminiOwnKeyConfigured(role: GeminiKeyRole): boolean {
  return Boolean(process.env[KEY_ENV[role]]);
}

export function geminiReaderConfigured(role: GeminiKeyRole = "reader"): boolean {
  return keysFor(role).length > 0;
}

/**
 * The reply text from the first key + model that answers, or null if none
 * did (or no key is set). Every failed attempt, and a feature left with no
 * answer at all, is recorded for Admin > System health.
 */
export async function geminiGenerate(
  parts: GeminiPart[],
  models: readonly GeminiModelTry[] = READER_MODELS,
  role: GeminiKeyRole = "reader"
): Promise<string | null> {
  const keys = keysFor(role);
  for (const { keyRole, apiKey } of keys) {
    const text = await generateWithKey(apiKey, parts, models, FEATURE[role], keyRole);
    if (text !== null) return text;
  }
  if (keys.length > 0) {
    recordAppEvent({
      kind: "gemini_unavailable",
      feature: FEATURE[role],
      message: "Gemini didn't answer on any key — the feature used its basic backup",
      detail: `${keys.length} key(s) × ${models.length} model(s) tried`,
    });
  }
  return null;
}

async function generateWithKey(
  apiKey: string,
  parts: GeminiPart[],
  models: readonly GeminiModelTry[],
  feature: string,
  keyRole: GeminiKeyRole
): Promise<string | null> {
  for (const { model, timeoutMs } of models) {
    let timedOut = false;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          // Reading a list needs no reasoning; thinking only adds seconds.
          generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } },
        }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      }
    ).catch((error: unknown) => {
      timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return null;
    });

    if (!response) {
      recordAppEvent(
        timedOut
          ? { kind: "gemini_timeout", feature, keyRole, message: `Gemini took longer than ${timeoutMs / 1000}s`, detail: model }
          : { kind: "gemini_error", feature, keyRole, message: "Couldn't reach Gemini (network error)", detail: model }
      );
      continue;
    }
    if (!response.ok) {
      recordAppEvent(
        response.status === 429
          ? { kind: "gemini_quota", feature, keyRole, message: "Gemini key hit its free-tier limit", detail: `${model} · HTTP 429` }
          : {
              kind: "gemini_error",
              feature,
              keyRole,
              message: response.status === 503 ? "Gemini is overloaded" : "Gemini returned an error",
              detail: `${model} · HTTP ${response.status}`,
            }
      );
      continue;
    }

    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const candidate = body?.candidates?.[0];
    if (!candidate) {
      recordAppEvent({ kind: "gemini_error", feature, keyRole, message: "Gemini returned an empty answer", detail: model });
      continue;
    }
    return (candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }
  return null;
}
