import "server-only";

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

function keysFor(role: GeminiKeyRole): string[] {
  const order = [role, ...(Object.keys(KEY_ENV) as GeminiKeyRole[]).filter((other) => other !== role)];
  const keys = order.map((entry) => process.env[KEY_ENV[entry]]);
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

export function geminiReaderConfigured(role: GeminiKeyRole = "reader"): boolean {
  return keysFor(role).length > 0;
}

/** The reply text from the first key + model that answers, or null if none did (or no key is set). */
export async function geminiGenerate(
  parts: GeminiPart[],
  models: readonly GeminiModelTry[] = READER_MODELS,
  role: GeminiKeyRole = "reader"
): Promise<string | null> {
  for (const apiKey of keysFor(role)) {
    const text = await generateWithKey(apiKey, parts, models);
    if (text !== null) return text;
  }
  return null;
}

async function generateWithKey(apiKey: string, parts: GeminiPart[], models: readonly GeminiModelTry[]): Promise<string | null> {
  for (const { model, timeoutMs } of models) {
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
    ).catch(() => null);
    if (!response?.ok) continue;

    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const candidate = body?.candidates?.[0];
    if (!candidate) continue;
    return (candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }
  return null;
}
