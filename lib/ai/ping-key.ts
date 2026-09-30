import "server-only";

export interface PingResult {
  ok: boolean;
  /** Plain-words result for the admin. */
  message: string;
  ms: number;
}

/**
 * Checks a Gemini key by listing models — accepted or rejected, without
 * generating anything, so it doesn't use the key's daily request quota.
 */
export async function pingGeminiKey(apiKey: string): Promise<PingResult> {
  const started = performance.now();
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null);
  const ms = Math.round(performance.now() - started);
  if (!response) return { ok: false, message: "Couldn't reach Google (network error or timeout).", ms };
  if (response.ok) return { ok: true, message: "Key works.", ms };
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { ok: false, message: "Google rejected this key — it's wrong, deleted, or the Gemini API isn't enabled for it.", ms };
  }
  if (response.status === 429) return { ok: true, message: "Key is valid but rate-limited right now.", ms };
  return { ok: false, message: `Google answered HTTP ${response.status}.`, ms };
}
