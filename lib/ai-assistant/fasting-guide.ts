import type { FastingInfo } from "@/types/ai-assistant";

/**
 * Built-in patient-preparation guide for common tests, keyed by catalog
 * code. The database has no fasting/preparation column, so this is the
 * assistant's answer to "does X need fasting?" when Gemini isn't available.
 * Standard general lab practice only — the UI always adds that the lab's or
 * doctor's own instructions take precedence.
 */
const yes = (note: string): FastingInfo => ({ required: "yes", note });
const recommended = (note: string): FastingInfo => ({ required: "recommended", note });
const no = (note = "No fasting needed"): FastingInfo => ({ required: "no", note });

const TESTS: Record<string, FastingInfo> = {
  // Glucose / diabetes
  FBS: yes("8–10 hours fasting (water allowed)"),
  RBS: no("No fasting — taken at any time"),
  PPBS: no("Taken 2 hours after a meal, usually after the fasting sample"),
  HBA: no(),
  INSFA: yes("8–10 hours fasting (water allowed)"),
  INSPP: no("Taken 2 hours after a meal"),
  CPEP: yes("8–10 hours fasting usually advised"),
  FRUCT: no(),
  // Lipids
  CHOL: yes("9–12 hours fasting usually advised"),
  TRIG: yes("9–12 hours fasting (water allowed)"),
  LDL: yes("9–12 hours fasting usually advised"),
  HCHO: yes("9–12 hours fasting usually advised"),
  SDLDL: yes("9–12 hours fasting usually advised"),
  APOA: no(),
  APOB: no(),
  LPA: no(),
  // Liver
  SGPT: recommended("8–12 hours fasting often preferred"),
  SGOT: recommended("8–12 hours fasting often preferred"),
  GGT: recommended("8–12 hours fasting often preferred"),
  ALKP: recommended("8–12 hours fasting often preferred"),
  BILT: recommended("8–12 hours fasting often preferred"),
  BILD: recommended("8–12 hours fasting often preferred"),
  // Kidney / electrolytes
  SCRE: no(),
  UREA: no(),
  BUN: no(),
  URIC: recommended("4 hours fasting often preferred"),
  SOD: no(),
  POT: no(),
  CHL: no(),
  CALC: no(),
  PHOS: recommended("Fasting sample often preferred"),
  MG: no(),
  // Iron / vitamins
  IRON: recommended("Morning fasting sample preferred"),
  TIBC: recommended("Morning fasting sample preferred"),
  FERR: no(),
  VITB: recommended("6–8 hours fasting often preferred"),
  FOLI: recommended("6–8 hours fasting often preferred"),
  VITB9: recommended("6–8 hours fasting often preferred"),
  VITDC: no(),
  VITD3: no(),
  VITA: recommended("Overnight fasting often preferred"),
  VITE: recommended("Overnight fasting often preferred"),
  HOMO: recommended("8 hours fasting often preferred"),
  // Thyroid
  TSH: no("No fasting needed (a morning sample is common)"),
  FT3: no(),
  FT4: no(),
  T3: no(),
  T4: no(),
  AMA: no(),
  ATG: no(),
  // Hormones
  TEST: no("No fasting — a morning sample (before 10 am) is preferred"),
  FTES: no("No fasting — a morning sample is preferred"),
  PRL: no("No fasting — morning sample, after resting"),
  LH: no(),
  FSH: no(),
  E2: no(),
  PROG: no(),
  AMH: no(),
  DHEA: no(),
  SHBG: no(),
  CORT: no("No fasting — timing matters (usually a morning sample)"),
  BHCG: no(),
  GASTR: yes("12 hours fasting"),
  HGH: yes("Overnight fasting usually advised"),
  // Blood count / inflammation / others
  H6: no(),
  ESR: no(),
  CRP: no(),
  HSCRP: no(),
  PSA: no("No fasting — avoid ejaculation and cycling for 48 hours before"),
  FPSA: no("No fasting — avoid ejaculation and cycling for 48 hours before"),
  CUA: no("No fasting — a first-morning, midstream urine sample is preferred"),
  UALB: no("No fasting — a first-morning urine sample is preferred"),
  BGRT: no(),
  CSAG: no(),
  CHCV: no(),
  CHIV: no(),
  TIGE: no(),
  RFAC: no(),
  ACCP: no(),
  ANA: no(),
};

/** Packages whose answer isn't simply their components' (e.g. LFT is usually done fasting as a panel). */
const PACKAGES: Record<string, FastingInfo> = {
  LIPID: yes("9–12 hours fasting (water allowed)"),
  LFT: recommended("8–12 hours fasting often preferred"),
  KFT: no("No fasting usually needed"),
  TFT: no("No fasting needed"),
  FTFT: no("No fasting needed"),
  SEEL: no(),
};

export function fastingForTest(code: string): FastingInfo | null {
  return TESTS[code.trim().toUpperCase()] ?? null;
}

/**
 * A package needs fasting if any component does: "yes" beats
 * "recommended" beats "no". Unknown components are ignored; if none are
 * known, there's no answer (null) rather than a guess.
 */
export function fastingForPackage(code: string, componentCodes: string[]): FastingInfo | null {
  const override = PACKAGES[code.trim().toUpperCase()];
  if (override) return override;
  const known = componentCodes
    .map((component) => ({ component, info: fastingForTest(component) }))
    .filter((entry): entry is { component: string; info: FastingInfo } => entry.info !== null);
  if (known.length === 0) return null;
  const needing = known.filter(({ info }) => info.required === "yes");
  if (needing.length > 0) {
    return yes(`${needing[0].info.note} — for ${needing.map(({ component }) => component).join(", ")}`);
  }
  const preferred = known.filter(({ info }) => info.required === "recommended");
  if (preferred.length > 0) {
    return recommended(`${preferred[0].info.note} — for ${preferred.map(({ component }) => component).join(", ")}`);
  }
  return no();
}
