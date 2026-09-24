import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { listActiveProfilesWithTests } from "@/lib/database/profiles";
import { normalizeQuery } from "./normalize-query";
import type { Test, TestAlias } from "@/types/test";
import type { ProfileWithTestIds } from "@/lib/database/profiles";

// Semantic fallback for the Quote search: when the rule-based matcher
// (lib/search/search-tests.ts) finds nothing strong, Claude reads the query
// the way a person would ("female health package", "blood test for sugar")
// and picks the closest items FROM THE CATALOG IT IS GIVEN. It never sees
// or returns prices — every code it returns is checked against the
// database, and price/TAT/availability are joined from the DB afterwards,
// so nothing it says can invent a test, a price or a TAT.

const MODEL = "claude-opus-5";
/** Most catalog items the model may return for one query. */
const MAX_MATCHES = 8;
/** Aliases listed per test in the catalog prompt — enough vocabulary, bounded size. */
const ALIASES_PER_TEST = 4;
/** A query's answer is reused for this long (per server instance). */
const ANSWER_TTL_MS = 60 * 60 * 1000;
const ANSWER_CACHE_LIMIT = 500;

const AnswerSchema = z.object({
  corrected_query: z.string().nullable(),
  matches: z
    .array(
      z.object({
        code: z.string(),
        kind: z.enum(["test", "package"]),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .max(MAX_MATCHES),
});

export type AiConfidence = "high" | "medium" | "low";

export interface AiSearchAnswer {
  /** The query as the model understood it, when it differs from what was typed. */
  correctedQuery: string | null;
  matches: { kind: "test" | "package"; id: string; confidence: AiConfidence }[];
}

/** True when an API key is configured; without one the AI layer is simply off. */
export function isAiSearchEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const INSTRUCTIONS = `You are the search engine of an internal diagnostic-lab quotation tool. You are not a chatbot.

Given a support agent's search query, pick the catalog items (tests and packages) the agent most likely means, from the CATALOG below only.

Rules:
- Return only codes that appear in the CATALOG, exactly as written. Never invent a test, package or code.
- Understand spelling mistakes, missing or extra spaces, abbreviations, nicknames, British/American spellings, plurals, word order and plain-language phrasing ("female health package", "blood test for sugar", "thyroid check").
- Order matches best first. Prefer a package when the query names a package/profile; prefer the individual test when it names one test.
- If the query is ambiguous ("vitamin test"), return the plausible options rather than choosing one.
- confidence: "high" = clearly what was meant; "medium" = likely; "low" = only loosely related.
- If nothing in the catalog reasonably matches, return an empty matches list. Returning nothing is better than a wrong item.
- Do not diagnose, and do not pick tests based on symptoms or medical conditions described in the query; only match names and wording.
- corrected_query: the query with obvious spelling fixed (e.g. "thyriod" -> "thyroid"), or null if it needed no correction.

CATALOG format: one item per line.
T|<code>|<official test name>|<other names, ";"-separated>
P|<code>|<package name>|<number of tests inside>`;

function buildCatalog(tests: Test[], aliases: TestAlias[], profiles: ProfileWithTestIds[]): string {
  const aliasesByTest = new Map<string, string[]>();
  for (const alias of aliases) {
    const list = aliasesByTest.get(alias.testId) ?? [];
    list.push(alias.alias);
    aliasesByTest.set(alias.testId, list);
  }
  // Stable order so the cached prompt prefix is byte-identical between requests.
  const testLines = [...tests]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((test) => {
      const names = (aliasesByTest.get(test.id) ?? []).sort().slice(0, ALIASES_PER_TEST);
      if (test.shortName && test.shortName !== test.code) names.unshift(test.shortName);
      return `T|${test.code}|${test.officialName}|${names.join("; ")}`;
    });
  const profileLines = [...profiles]
    .sort((a, b) => a.profile.code.localeCompare(b.profile.code))
    .map(({ profile, testIds }) => `P|${profile.code}|${profile.name}|${testIds.length}`);
  return [...testLines, ...profileLines].join("\n");
}

const answers = new Map<string, { at: number; answer: AiSearchAnswer }>();

/**
 * Asks Claude which catalog items the query means. Null when the AI layer
 * is off (no API key) or the call fails — search then just shows the
 * rule-based results. Answers are cached per normalized query.
 */
export async function aiSearch(query: string): Promise<AiSearchAnswer | null> {
  if (!isAiSearchEnabled()) return null;
  const key = normalizeQuery(query);
  if (key.length < 2) return null;

  const cached = answers.get(key);
  if (cached && Date.now() - cached.at < ANSWER_TTL_MS) return cached.answer;

  const [tests, aliases, profiles] = await Promise.all([
    listActiveTests(),
    listActiveAliases(),
    listActiveProfilesWithTests(),
  ]);

  let parsed: z.infer<typeof AnswerSchema> | null;
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // Refusals are unlikely for catalog lookup, but if one happens the
      // API retries on a fallback model instead of returning nothing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AnswerSchema) },
      system: [
        { type: "text", text: INSTRUCTIONS },
        // The catalog is the same for every query — cached after the first call.
        { type: "text", text: `CATALOG\n${buildCatalog(tests, aliases, profiles)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `Search query: ${query.trim()}` }],
    });
    if (response.stop_reason === "refusal") return null;
    parsed = response.parsed_output;
  } catch (error) {
    // Any API failure degrades to rule-based results only.
    console.error("[ai-search]", error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error);
    return null;
  }
  if (!parsed) return null;

  // Keep only codes that really exist — the database is the source of truth.
  const testByCode = new Map(tests.map((test) => [test.code.toLowerCase(), test]));
  const profileByCode = new Map(profiles.map(({ profile }) => [profile.code.toLowerCase(), profile]));
  const seen = new Set<string>();
  const matches: AiSearchAnswer["matches"] = [];
  for (const match of parsed.matches) {
    const item =
      match.kind === "test" ? testByCode.get(match.code.toLowerCase()) : profileByCode.get(match.code.toLowerCase());
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    matches.push({ kind: match.kind, id: item.id, confidence: match.confidence });
  }

  const corrected = parsed.corrected_query?.trim() || null;
  const answer: AiSearchAnswer = {
    correctedQuery: corrected && normalizeQuery(corrected) !== key ? corrected : null,
    matches,
  };
  if (answers.size >= ANSWER_CACHE_LIMIT) answers.clear();
  answers.set(key, { at: Date.now(), answer });
  return answer;
}
