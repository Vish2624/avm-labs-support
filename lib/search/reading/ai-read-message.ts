import "server-only";
import { READER_MODELS, geminiGenerate } from "@/lib/ai/gemini";
import { browseProfiles, browseTests } from "../catalog/browse-catalog";
import { isPackageName } from "../matching/is-package-name";
import type { ServiceType } from "@/lib/constants/service-types";

/** Marks a requested item that isn't in the catalog list, as the customer wrote it. */
const NOT_LISTED = "?";

const INSTRUCTIONS = `You help a diagnostic lab's support agent. Below is a customer's message (or a prescription's text) and the lab's list of tests and profiles at this branch, one per line as "CODE | name".

Find every lab test or profile the customer is asking for, and reply with one line per item:
- If it is in the list, write its CODE exactly as listed. Match by meaning, not only spelling: abbreviations, common names, typos and other languages all count ("sugar test" = fasting blood sugar, "RFT" = kidney function tests, "vit d" = vitamin D, "thyroid" = the thyroid profile if listed).
- Prefer a profile when the customer names a profile or panel ("lipid profile", "kidney function"); otherwise the single test.
- If it is NOT in the list, write "${NOT_LISTED}" followed by the name as the customer wrote it (e.g. "${NOT_LISTED}Vitamin K").
- Split combined items ("vit D and B12" = two lines). Never repeat an item.
Ignore everything that is not a test request: greetings, names, dates, prices, questions about timing or home collection, symptoms, medicines.
Reply with the lines only — no numbering, bullets or explanations. If nothing is asked for, reply with nothing.`;

/**
 * Turns a free-text customer message into what extractTests() needs:
 * `codes` — catalog codes for everything Gemini recognised among the tests
 * and packages actually priced here — and `notListed`, the names (as
 * written) of what it asked for that isn't. Those go straight to "not
 * available" rather than through the fuzzy matcher, which would otherwise
 * turn "vitamin K" into Potassium (K). Gemini only ever picks from real
 * catalog codes; prices, TAT and availability are joined from the database
 * afterwards, never taken from the model. Null when Gemini isn't
 * configured or didn't answer — the caller then reads the message with the
 * rule-based reader alone.
 */
export async function aiListRequestedTests(
  message: string,
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<{ codes: string; notListed: string[] } | null> {
  const catalogLines = await catalogListing(locationId, serviceTypes, false);
  if (catalogLines.length === 0) return null;

  const reply = await geminiGenerate(
    [{ text: `${INSTRUCTIONS}\n\nLAB LIST:\n${catalogLines.join("\n")}\n\nCUSTOMER MESSAGE:\n${message}` }],
    READER_MODELS,
    "reader",
    { hedgeAfterMs: HEDGE_AFTER_MS }
  );
  return reply === null ? null : codesAndNotListed(reply);
}

/** An agent is waiting on the paste tab: race another key if Gemini hasn't answered by then. */
const HEDGE_AFTER_MS = 3500;

const IMAGE_INSTRUCTIONS = `You help a diagnostic lab's support agent. The image is a doctor's prescription, a lab request form, or a screenshot of a customer's message — often handwritten. Below is the lab's list of tests and profiles at this branch, one per line as "CODE | name".

Read the image and find every lab test or profile it asks for, and reply with one line per item:
- If it is in the list, write its CODE exactly as listed. Match by meaning, not only spelling: fix handwriting, and count abbreviations and common names ("CBC"/"CBP"/"Hb" = the complete blood count or hemogram, "RFT" = kidney function tests, "vit d" = vitamin D, "S. creatinine" = serum creatinine).
- Prefer a profile when the image names a profile or panel ("lipid profile", "kidney function"); otherwise the single test.
- If it is NOT in the list, write "${NOT_LISTED}" followed by the test's usual name (e.g. "${NOT_LISTED}Vitamin K").
- Split combined items ("Vit D + B12" = two lines). Never repeat an item.
Ignore everything that is not a test request: patient and doctor names, dates, ages, addresses, phone numbers, clinic details, stamps, signatures, symptoms, diagnoses and medicines. If a word can't be read, leave it out rather than guessing.
Reply with the lines only — no numbering, bullets or explanations. If nothing is asked for, reply with nothing.`;

/**
 * aiListRequestedTests() for a prescription/message image, in one Gemini
 * request: the image is read and matched to catalog codes together, rather
 * than read into names first and matched in a second request. Null when
 * Gemini isn't configured or didn't answer.
 */
export async function aiReadImageTests(
  image: { mimeType: string; base64: string },
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<{ codes: string; notListed: string[] } | null> {
  const catalogLines = await catalogListing(locationId, serviceTypes, false);
  if (catalogLines.length === 0) return null;

  const reply = await geminiGenerate(
    [
      { inline_data: { mime_type: image.mimeType, data: image.base64 } },
      { text: `${IMAGE_INSTRUCTIONS}\n\nLAB LIST:\n${catalogLines.join("\n")}` },
    ],
    READER_MODELS,
    "image",
    { hedgeAfterMs: HEDGE_AFTER_MS }
  );
  return reply === null ? null : codesAndNotListed(reply);
}

/** Splits a reader reply into catalog codes and the "?"-marked items that aren't listed. */
function codesAndNotListed(reply: string): { codes: string; notListed: string[] } {
  const lines = replyLines(reply);
  const notListed = lines
    .filter((line) => line.startsWith(NOT_LISTED))
    .map((line) => line.slice(NOT_LISTED.length).trim())
    .filter(Boolean);
  const codes = lines.filter((line) => !line.startsWith(NOT_LISTED)).join("\n");
  return { codes, notListed: [...new Set(notListed)] };
}

/** Most items the search-box AI suggests for one query. */
const MAX_SEARCH_PICKS = 6;

const SEARCH_INSTRUCTIONS = `You help a diagnostic lab's support agent search the lab's list of tests and packages (below, one per line as "CODE | name"). The agent typed a search.
Reply with the CODES of the items that best match what they are looking for, best first, one per line, at most ${MAX_SEARCH_PICKS}:
- If they name a test or package in any way — abbreviation, other name, typo, other language ("sugar test", "vit d", "RFT", "thyriod") — give that item (and a closely related package if there is one).
- If they describe a symptom, condition or purpose ("hair fall", "tiredness", "pregnancy", "diabetes checkup"), give the tests or packages commonly done for it.
Only use codes from the list, copied exactly. If nothing fits, reply with nothing. Reply with the codes only — no numbering, bullets or explanations.`;

/**
 * The search box's AI fallback, used when the rule-based search has no
 * strong hit: catalog codes (only from what is priced here) that match
 * what the agent typed, by meaning — for extractTests() to price. Null
 * when Gemini isn't configured or didn't answer.
 */
export async function aiSearchCatalog(
  query: string,
  locationId: string,
  serviceTypes: readonly ServiceType[],
  /** The Support Assistant may suggest packages; the search box never does. */
  includePackages: boolean
): Promise<string | null> {
  const catalogLines = await catalogListing(locationId, serviceTypes, includePackages);
  if (catalogLines.length === 0) return null;

  const reply = await geminiGenerate(
    [{ text: `${SEARCH_INSTRUCTIONS}\n\nLAB LIST:\n${catalogLines.join("\n")}\n\nSEARCH:\n${query}` }],
    READER_MODELS,
    "search",
    { hedgeAfterMs: HEDGE_AFTER_MS }
  );
  if (reply === null) return null;
  return replyLines(reply)
    .filter((line) => !line.startsWith(NOT_LISTED))
    .slice(0, MAX_SEARCH_PICKS)
    .join("\n");
}

/** Gemini's reply as trimmed lines, stray list markers removed — codes can start with a digit ("17OH"). */
function replyLines(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:[-*•]\s*|\d+[.)]\s+)/, "").trim())
    .filter(Boolean);
}

/**
 * "CODE | name" for every test and profile priced here (the catalog cache
 * makes this cheap) — and packages too only with `includePackages` (the
 * Support Assistant); the paste reader never offers packages.
 */
async function catalogListing(
  locationId: string,
  serviceTypes: readonly ServiceType[],
  includePackages: boolean
): Promise<string[]> {
  const catalogs = await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const [tests, profiles] = await Promise.all([
        browseTests(locationId, serviceType),
        browseProfiles(locationId, serviceType),
      ]);
      return [
        ...tests.map((test) => `${test.code} | ${test.officialName}${test.shortName ? ` (${test.shortName})` : ""}`),
        ...profiles
          .filter((profile) => includePackages || !isPackageName(profile.name))
          .map((profile) => `${profile.code} | ${profile.name} (${isPackageName(profile.name) ? "package" : "profile"})`),
      ];
    })
  );
  return [...new Set(catalogs.flat())];
}
