import "server-only";
import { recordAppEvent } from "@/lib/database/app-events";
import { loadUsableKeys, recordApiCall, type UsableKey } from "@/lib/database/api-keys";
import type { ApiCallOutcome } from "@/types/api-key";

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
 * Which feature a free-tier key (a separate Google account each, so a
 * separate daily quota) serves first:
 * "reader" = pasted text (GEMINI_API_KEY);
 * "image" = prescription images (GEMINI_API_KEY_IMAGE);
 * "search" = the search box's AI matches (GEMINI_API_KEY_SEARCH);
 * "assistant" = the Support Assistant (GEMINI_API_KEY_ASSISTANT).
 * Admins can add more keys on Admin > API usage (lib/database/api-keys.ts),
 * for one feature, "shared" or "backup".
 */
export type GeminiKeyRole = "reader" | "image" | "search" | "assistant";

const KEY_ENV: Record<GeminiKeyRole, string> = {
  reader: "GEMINI_API_KEY",
  image: "GEMINI_API_KEY_IMAGE",
  search: "GEMINI_API_KEY_SEARCH",
  assistant: "GEMINI_API_KEY_ASSISTANT",
};

/** Gemini's free-tier daily quotas reset at midnight Pacific time. */
function quotaDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** Keys that got a 429 (daily limit reached), and the quota day it happened — tried last until the reset. */
const quotaHit = new Map<string, string>();

/**
 * The keys to try for a feature: its own, then shared keys, then other
 * features' keys (borrowing their quota), then backup keys — with any key
 * that has already hit its daily limit today moved to the very end.
 */
async function keysFor(role: GeminiKeyRole): Promise<KeyChoice[]> {
  const rank = (key: UsableKey) => (key.role === role ? 0 : key.role === "shared" ? 1 : key.role === "backup" ? 3 : 2);
  const today = quotaDay();
  const seen = new Set<string>();
  return (await loadUsableKeys())
    .filter((key) => !seen.has(key.apiKey) && Boolean(seen.add(key.apiKey)))
    .map((key, index) => ({ key, index, spent: quotaHit.get(key.apiKey) === today }))
    .sort((a, b) => Number(a.spent) - Number(b.spent) || rank(a.key) - rank(b.key) || a.index - b.index)
    .map(({ key }) => ({
      id: key.id,
      apiKey: key.apiKey,
      label: key.label,
      // Failures on shared/backup keys are logged under the feature using them.
      keyRole: key.role in KEY_ENV ? (key.role as GeminiKeyRole) : role,
      own: key.role === role,
    }));
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

export async function geminiReaderConfigured(role: GeminiKeyRole = "reader"): Promise<boolean> {
  return (await keysFor(role)).length > 0;
}

/**
 * The reply text from the first key + model that answers, or null if none
 * did (or no key is set). Every failed attempt, and a feature left with no
 * answer at all, is recorded for Admin > System health.
 */
export async function geminiGenerate(
  parts: GeminiPart[],
  models: readonly GeminiModelTry[] = READER_MODELS,
  role: GeminiKeyRole = "reader",
  options: { hedgeAfterMs?: number } = {}
): Promise<string | null> {
  const keys = await keysFor(role);
  const text = options.hedgeAfterMs
    ? await generateHedged(keys, parts, models, FEATURE[role], options.hedgeAfterMs)
    : await generateInTurn(keys, parts, models, FEATURE[role]);
  if (text === null && keys.length > 0) {
    recordAppEvent({
      kind: "gemini_unavailable",
      feature: FEATURE[role],
      message: "Gemini didn't answer on any key — the feature used its basic backup",
      detail: `${keys.length} key(s) × ${models.length} model(s) tried`,
    });
  }
  return text;
}

type KeyChoice = {
  /** api_keys id, for counting calls; null before the table exists. */
  id: string | null;
  apiKey: string;
  label: string;
  keyRole: GeminiKeyRole;
  /** The feature's own key (not borrowed / shared / backup). */
  own: boolean;
};

/** Each key in turn, each model in turn — one request at a time. */
async function generateInTurn(
  keys: KeyChoice[],
  parts: GeminiPart[],
  models: readonly GeminiModelTry[],
  feature: string
): Promise<string | null> {
  for (const key of keys) {
    for (const { model, timeoutMs } of models) {
      const text = await attempt(key, model, timeoutMs, parts, feature);
      if (text !== null) return text;
    }
  }
  return null;
}

/** Most requests a hedged call keeps in flight at once. */
const MAX_HEDGED_IN_FLIGHT = 4;

/**
 * For features an agent is waiting on. Free-tier answers usually take
 * 3-6 s, but either model can be overloaded for a while (Sep 29 2026: 3.1
 * Flash Lite took 8-37 s with 503s while 3.5 Flash Lite took 3-10 s; the
 * day before it was the other way round). So the request starts on one key
 * per model at once, and if neither has answered after `hedgeAfterMs` (or
 * one fails) it also goes to the next key; the first answer wins and the
 * rest are cancelled. Costs some extra free quota, never money.
 */
function generateHedged(
  keys: KeyChoice[],
  parts: GeminiPart[],
  models: readonly GeminiModelTry[],
  feature: string,
  hedgeAfterMs: number
): Promise<string | null> {
  // Every key × model, ordered so consecutive attempts use a different key
  // and alternate models: k1·m1, k2·m2, k3·m1, k4·m2, then the other pairs.
  const queue: (KeyChoice & GeminiModelTry)[] = [];
  const queued = new Set<string>();
  for (let pass = 0; pass < models.length; pass++) {
    keys.forEach((key, i) => {
      const model = models[(i + pass) % models.length];
      const id = `${key.apiKey}|${model.model}`;
      if (queued.has(id)) return;
      queued.add(id);
      queue.push({ ...key, ...model });
    });
  }
  if (queue.length === 0) return Promise.resolve(null);
  const startWith = Math.min(models.length, queue.length);
  const cancel = new AbortController();

  return new Promise((resolve) => {
    let next = 0;
    let inFlight = 0;
    let done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (text: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      cancel.abort();
      resolve(text);
    };
    const launch = () => {
      clearTimeout(hedgeTimer);
      if (done || next >= queue.length || inFlight >= MAX_HEDGED_IN_FLIGHT) return;
      const { model, timeoutMs, ...key } = queue[next++];
      inFlight++;
      attempt(key, model, timeoutMs, parts, feature, cancel.signal).then((text) => {
        inFlight--;
        if (text !== null) return finish(text);
        // Failed: try the next key straight away; out of options: give up.
        if (next < queue.length) launch();
        else if (inFlight === 0) finish(null);
      });
      // Still waiting after a while: race the next key too.
      if (next < queue.length) hedgeTimer = setTimeout(launch, hedgeAfterMs);
    };
    // One request per model straight away.
    for (let i = 0; i < startWith; i++) launch();
  });
}

/** One request to one model on one key: its reply text, or null (every failure is logged). */
async function attempt(
  { id, apiKey, keyRole, label, own }: KeyChoice,
  model: string,
  timeoutMs: number,
  parts: GeminiPart[],
  feature: string,
  cancelled?: AbortSignal
): Promise<string | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
  // What System health shows as the failed attempt's detail.
  const where = own ? model : `${model} · ${label}`;
  // Every request is counted for Admin > API usage, whatever happened to it.
  const started = performance.now();
  const log = (outcome: ApiCallOutcome, httpStatus: number | null = null) =>
    recordApiCall({ keyId: id, feature, model, outcome, httpStatus, latencyMs: performance.now() - started });
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
      signal: cancelled ? AbortSignal.any([timeout, cancelled]) : timeout,
      cache: "no-store",
    }
  ).catch(() => null);

  // Lost a hedged race — not a failure worth logging (but it was a request).
  if (cancelled?.aborted) {
    log("cancelled", response?.status ?? null);
    return null;
  }
  if (!response) {
    log(timeout.aborted ? "timeout" : "network");
    recordAppEvent(
      timeout.aborted
        ? { kind: "gemini_timeout", feature, keyRole, message: `Gemini took longer than ${timeoutMs / 1000}s`, detail: where }
        : { kind: "gemini_error", feature, keyRole, message: "Couldn't reach Gemini (network error)", detail: where }
    );
    return null;
  }
  if (!response.ok) {
    log(response.status === 429 ? "quota" : "error", response.status);
    // A per-day limit (not the per-minute one): try this key last until the reset.
    if (response.status === 429 && /per ?day/i.test(await response.text().catch(() => ""))) {
      quotaHit.set(apiKey, quotaDay());
    }
    recordAppEvent(
      response.status === 429
        ? { kind: "gemini_quota", feature, keyRole, message: "Gemini key hit its free-tier limit", detail: `${where} · HTTP 429` }
        : {
            kind: "gemini_error",
            feature,
            keyRole,
            message: response.status === 503 ? "Gemini is overloaded" : "Gemini returned an error",
            detail: `${where} · HTTP ${response.status}`,
          }
    );
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  if (cancelled?.aborted) {
    log("cancelled", response.status);
    return null;
  }
  const candidate = body?.candidates?.[0];
  if (!candidate) {
    log("empty", response.status);
    recordAppEvent({ kind: "gemini_error", feature, keyRole, message: "Gemini returned an empty answer", detail: where });
    return null;
  }
  log("ok", response.status);
  return (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}
