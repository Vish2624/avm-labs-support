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
  role: GeminiKeyRole = "reader",
  options: { hedgeAfterMs?: number } = {}
): Promise<string | null> {
  const keys = keysFor(role);
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

type KeyChoice = { keyRole: GeminiKeyRole; apiKey: string };

/** Each key in turn, each model in turn — one request at a time. */
async function generateInTurn(
  keys: KeyChoice[],
  parts: GeminiPart[],
  models: readonly GeminiModelTry[],
  feature: string
): Promise<string | null> {
  for (const { keyRole, apiKey } of keys) {
    for (const { model, timeoutMs } of models) {
      const text = await attempt(apiKey, model, timeoutMs, parts, feature, keyRole);
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
      const id = `${key.keyRole}|${model.model}`;
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
      const { apiKey, keyRole, model, timeoutMs } = queue[next++];
      inFlight++;
      attempt(apiKey, model, timeoutMs, parts, feature, keyRole, cancel.signal).then((text) => {
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
  apiKey: string,
  model: string,
  timeoutMs: number,
  parts: GeminiPart[],
  feature: string,
  keyRole: GeminiKeyRole,
  cancelled?: AbortSignal
): Promise<string | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
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

  // Lost a hedged race — not a failure worth logging.
  if (cancelled?.aborted) return null;
  if (!response) {
    recordAppEvent(
      timeout.aborted
        ? { kind: "gemini_timeout", feature, keyRole, message: `Gemini took longer than ${timeoutMs / 1000}s`, detail: model }
        : { kind: "gemini_error", feature, keyRole, message: "Couldn't reach Gemini (network error)", detail: model }
    );
    return null;
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
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  if (cancelled?.aborted) return null;
  const candidate = body?.candidates?.[0];
  if (!candidate) {
    recordAppEvent({ kind: "gemini_error", feature, keyRole, message: "Gemini returned an empty answer", detail: model });
    return null;
  }
  return (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}
