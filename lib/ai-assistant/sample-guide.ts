import type { SampleNeed, SampleTube } from "@/types/ai-assistant";

/** Shown to the agent (never copied to the customer): what comes from our records and what doesn't. */
export const SAMPLE_SOURCE_NOTE =
  "Blood/urine, fasting, price and report time are from our records. The tube (EDTA, serum, fluoride…) is from our records once it's set on the website, otherwise general lab practice — confirm with the collection team if unsure.";

/**
 * Which blood tube a test usually goes in, for tests the website hasn't set
 * a tube for yet — general lab practice, not our records; the assistant says
 * so to the agent. Keyed by catalog code first, then by name;
 * any other blood test is a serum test (most chemistry, hormones, vitamins,
 * antibodies and tumour markers are).
 */
const TUBE_BY_CODE: Record<string, SampleTube> = {
  "HEMOGRAM - 6 PART (DIFF)": "EDTA",
  "PERIPHERAL BLOOD SMEAR (PBS)": "EDTA",
  HBA: "EDTA",
  DREN: "EDTA",
  FBS: "Fluoride",
  PPBS: "Fluoride",
  RBS: "Fluoride",
};

const TUBE_BY_NAME: [RegExp, SampleTube][] = [
  [/\b(cbc|hemogram|haemogram|blood count|smear|esr|hba1c|blood group|g6pd|reticulocyte|renin)\b/i, "EDTA"],
  [/\b(pt|inr|aptt|ptt|d dimer|d-dimer|fibrinogen|coagulation)\b/i, "Citrate"],
  [/\b(blood sugar|glucose|gtt|lactate)\b/i, "Fluoride"],
];

export function tubeFor(code: string, name: string): SampleTube {
  return TUBE_BY_CODE[code.trim().toUpperCase()] ?? TUBE_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? "Serum";
}

const TUBES: readonly SampleTube[] = ["EDTA", "Serum", "Fluoride", "Citrate", "Heparin"];
const recordedTube = (tube: string | null | undefined) => TUBES.find((known) => known.toLowerCase() === tube?.trim().toLowerCase());

/**
 * A test's sample from our records ("Blood"/"Urine"). For blood: the tube set
 * on the website when it's one we know, else the usual tube by lab practice.
 */
export function sampleForTest(code: string, name: string, specimen: string | null, tube: string | null = null): SampleNeed | null {
  if (!specimen) return null;
  return { specimen, tube: /^blood$/i.test(specimen) ? (recordedTube(tube) ?? tubeFor(code, name)) : null, tests: [name] };
}

const sampleKey = (sample: Pick<SampleNeed, "specimen" | "tube">) => `${sample.specimen.toLowerCase()}|${sample.tube ?? ""}`;

/** Blood tubes first (EDTA, serum, fluoride, citrate, heparin), then urine and anything else. */
const ORDER = ["blood|EDTA", "blood|Serum", "blood|Fluoride", "blood|Citrate", "blood|Heparin", "urine|"];
const rank = (sample: SampleNeed) => {
  const index = ORDER.indexOf(sampleKey(sample));
  return index < 0 ? ORDER.length : index;
};

/** Samples merged by specimen + tube, each test listed once, in collection order. */
export function mergeSamples(samples: SampleNeed[]): SampleNeed[] {
  const byKey = new Map<string, SampleNeed>();
  for (const sample of samples) {
    const existing = byKey.get(sampleKey(sample));
    if (!existing) byKey.set(sampleKey(sample), { ...sample, tests: [...sample.tests] });
    else for (const test of sample.tests) if (!existing.tests.includes(test)) existing.tests.push(test);
  }
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

const TUBE_LABEL: Record<SampleTube, string> = {
  EDTA: "EDTA tube (purple top)",
  Serum: "Serum tube (yellow/red top)",
  Fluoride: "Fluoride tube (grey top)",
  Citrate: "Citrate tube (blue top)",
  Heparin: "Heparin tube (green top)",
};

/** "Blood – EDTA tube (purple top)", "Urine – sterile container". */
export function sampleLabel(sample: Pick<SampleNeed, "specimen" | "tube">): string {
  if (sample.tube) return `Blood, ${TUBE_LABEL[sample.tube]}`;
  if (/^urine$/i.test(sample.specimen)) return "Urine, sterile container";
  return sample.specimen;
}

/** Short pill text: "EDTA", "Serum", "Urine". */
export function sampleShortLabel(sample: Pick<SampleNeed, "specimen" | "tube">): string {
  return sample.tube ?? sample.specimen;
}
