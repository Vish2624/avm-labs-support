import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { sumMoney } from "@/lib/pricing/money";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { customerName } from "./customer-labels";
import { mergeSamples, sampleLabel } from "./sample-guide";
import type { AiAnswer, AiSuggestion, SampleNeed } from "@/types/ai-assistant";

/**
 * Answers built only from our records for "what sample for CBC, lipid
 * profile and urine?" and "all details of these tests": each item on its
 * own line, then the totals for the whole list — every sample to collect
 * (merged by tube), whether to come fasting, the longest report time and
 * the total price. Sample type (blood/urine), fasting, price and report
 * time are the website's; only the blood tube is general lab practice.
 */

/** More tests than this in one tube are counted, not named. */
const MAX_NAMED_TESTS = 4;

const namesOrCount = (names: string[]) =>
  names.length <= MAX_NAMED_TESTS ? names.join(", ") : `${names.length} tests`;

/** One item's samples: "Blood, EDTA tube (purple top)" or, for a mixed package, each tube with its tests. */
function itemSamples(item: AiSuggestion): string {
  if (item.samples.length === 0) return "sample not in our records — please confirm with the lab team";
  if (item.samples.length === 1) return sampleLabel(item.samples[0]);
  return item.samples.map((sample) => `${containerName(sample)} (${namesOrCount(sample.tests)})`).join(", ");
}

/** "EDTA tube", "Serum tube", "Urine container" — for a package that needs several. */
function containerName(sample: SampleNeed): string {
  if (sample.tube) return `${sample.tube} tube`;
  return /^urine$/i.test(sample.specimen) ? "Urine container" : sample.specimen;
}

/** Every sample the whole list needs, each tube once, naming the items collected in it. */
function totalSamples(items: AiSuggestion[]): SampleNeed[] {
  return mergeSamples(
    items.flatMap((item) => item.samples.map((sample) => ({ ...sample, tests: [customerName(item)] })))
  );
}

/** One line per sample to collect: one item's tubes with its tests, or the whole list's tubes with the items in each. */
function sampleLines(items: AiSuggestion[]): string[] {
  const samples = items.length === 1 ? items[0].samples : totalSamples(items);
  return samples.map((sample) => `• ${sampleLabel(sample)} – ${namesOrCount(sample.tests)}`);
}

/** "Fasting: required — 8–12 hours (plain water is fine), for Lipid Profile" — one line for the whole visit. */
function fastingLine(items: AiSuggestion[]): string {
  const needs = items.filter((item) => item.fasting?.required === "yes");
  if (needs.length > 0) {
    // One package: name the tests in it that need fasting ("for Total Cholesterol, Triglycerides").
    const [note, inside] = needs[0].fasting!.note.split(" — for ");
    const forWhat = needs.length === 1 && inside ? inside : needs.map(customerName).join(", ");
    return `Fasting: required – ${note}, for ${forWhat}`;
  }
  const preferred = items.filter((item) => item.fasting?.required === "recommended");
  if (preferred.length > 0) return `Fasting: preferred – for ${preferred.map(customerName).join(", ")}`;
  const unknown = items.filter((item) => !item.fasting);
  if (unknown.length === items.length) return "Fasting: please confirm with the lab team";
  if (unknown.length > 0) return `Fasting: not needed (please confirm for ${unknown.map(customerName).join(", ")})`;
  return "Fasting: not needed – normal meals are fine";
}

const FASTING_SHORT = { yes: "fasting required", recommended: "fasting preferred", no: "no fasting" } as const;

/** "24 hrs" -> 24, "3 days" -> 72; null when the text isn't a plain duration. */
function tatHours(tat: string): number | null {
  const text = tat.toLowerCase();
  if (/same day/.test(text)) return 12;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(h|hr|hrs|hour|hours|d|day|days|working days?)\b/);
  if (!match) return null;
  const amount = Number(match[2] ?? match[1]);
  return match[3].startsWith("h") ? amount : amount * 24;
}

/** The longest report time on the list, as written in our records; null when one can't be read. */
function longestTat(items: AiSuggestion[]): string | null {
  let longest: { hours: number; text: string } | null = null;
  for (const item of items) {
    const hours = tatHours(item.tatText);
    if (hours === null) return null;
    if (!longest || hours > longest.hours) longest = { hours, text: formatTat(item.tatText) };
  }
  return longest?.text ?? null;
}

/**
 * `alternatives`: the items are options for one name ("hair fall profile" ->
 * two profiles), not a list to book together — no totals, no merged samples.
 */
interface ListOptions {
  alternatives?: boolean;
}

const notFoundLines = (notFound: string[]) => (notFound.length > 0 ? ["", `We couldn't find: ${notFound.join(", ")}.`] : []);

/** "Which sample for CBC, lipid profile and urine analysis?" — per item, then everything to collect. */
export function sampleAnswer(
  items: AiSuggestion[],
  notFound: string[],
  { alternatives = false }: ListOptions = {}
): { answer: AiAnswer; reply: string } {
  const perItem = items.map((item) => `• ${customerName(item)} – ${itemSamples(item)}`);
  const merged = totalSamples(items);
  const single = items.length === 1 ? items[0] : null;
  const lines = single
    ? single.samples.length > 1
      ? // One package needing several samples: each tube with the tests in it.
        [`Samples needed for ${customerName(single)} (${single.samples.length}):`, "", ...sampleLines(items)]
      : ["Sample needed:", "", ...perItem]
    : [
        alternatives ? "Sample for each option:" : "Sample for each test:",
        "",
        ...perItem,
        ...(merged.length > 0 && !alternatives
          ? ["", `Samples to collect in total (${merged.length}):`, "", ...sampleLines(items)]
          : []),
      ];
  lines.push("", fastingLine(items));
  const reply = [`Hi! ${lines[0]}`, ...lines.slice(1), ...notFoundLines(notFound)].join("\n");
  return { answer: { subject: "sample", verdict: null, text: lines.join("\n") }, reply };
}

/** "All details for HbA1c, lipid profile, TSH" — price, report time, sample and fasting per item, then the totals. */
export function detailsAnswer(
  items: AiSuggestion[],
  notFound: string[],
  { alternatives = false }: ListOptions = {}
): { answer: AiAnswer; reply: string } {
  const perItem = items.map((item) => {
    const parts = [
      formatCurrency(item.price),
      `report in ${formatTat(item.tatText)}`,
      ...(item.kind === "package" ? [`${item.tests.length} tests`] : []),
      // One package needing several tubes: listed under "Samples to collect" instead.
      item.samples.length === 1 || (item.samples.length > 1 && items.length > 1) ? itemSamples(item) : null,
      item.fasting ? FASTING_SHORT[item.fasting.required] : null,
      item.availability === "available" ? null : AVAILABILITY_LABELS[item.availability].toLowerCase(),
    ].filter(Boolean);
    return `• ${customerName(item)} – ${parts.join(" · ")}`;
  });

  const totals: string[] = [];
  if (items.length > 1 && !alternatives) {
    const currency = items[0].price.currency;
    const sameCurrency = items.every((item) => item.price.currency === currency);
    if (sameCurrency) totals.push(`Total: ${formatCurrency(sumMoney(items.map((item) => item.price), currency))} (${items.length} items)`);
    const longest = longestTat(items);
    if (longest) totals.push(`All reports ready within ${longest}`);
  }
  const merged = totalSamples(items);
  const lines = [
    items.length === 1 ? "Here are the details:" : alternatives ? "We have these options:" : "Details for each test:",
    "",
    ...perItem,
    "",
    ...totals,
    fastingLine(items),
    ...(merged.length > 0 && !alternatives && (items.length > 1 || merged.length > 1)
      ? ["", `Samples to collect (${merged.length}):`, "", ...sampleLines(items)]
      : []),
  ];
  const reply = [`Hi! ${lines[0]}`, ...lines.slice(1), ...notFoundLines(notFound)].join("\n");
  return { answer: { subject: "details", verdict: null, text: lines.join("\n") }, reply };
}
