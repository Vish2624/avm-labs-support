// Customer-facing test names for the Support Assistant's replies — shared by
// the server (replies built from DB facts) and the client (the fallback
// message built from ticked tests). Plain module: no server-only imports.

export const SHORT_NOTICE =
  "Note: These are general suggestions, not a diagnosis. Please consult a qualified doctor for advice, especially before starting or changing any medication.";

/** Plain customer-facing name + what it checks, for common tests; others fall back to the catalog name. */
export const CUSTOMER_LABELS: Record<string, [name: string, checks: string]> = {
  HBA: ["HbA1c", "3-month average blood sugar"],
  FBS: ["Fasting Blood Sugar", "blood sugar"],
  PPBS: ["Post-meal Blood Sugar", "blood sugar after food"],
  RBS: ["Random Blood Sugar", "blood sugar"],
  INSFA: ["Fasting Insulin", "insulin resistance"],
  LIPID: ["Lipid Profile", "cholesterol"],
  LFT: ["Liver Function Test", "liver health"],
  KFT: ["Kidney Function Test", "kidney health"],
  TSH: ["Thyroid (TSH)", "thyroid function"],
  TFT: ["Thyroid Profile (T3, T4, TSH)", "thyroid function"],
  FTFT: ["Free Thyroid Profile", "thyroid function"],
  FT3: ["Free T3", "thyroid hormone"],
  FT4: ["Free T4", "thyroid hormone"],
  H6: ["Complete Blood Count (CBC)", "blood count & anaemia"],
  FERR: ["Ferritin", "iron stores"],
  IRON: ["Serum Iron", "iron level"],
  TIBC: ["TIBC", "iron binding"],
  VITDC: ["Vitamin D", "vitamin D level"],
  VITB: ["Vitamin B12", "vitamin B12 level"],
  FOLI: ["Folate", "folate level"],
  SEZN: ["Zinc", "zinc level"],
  CALC: ["Calcium", "calcium level"],
  MG: ["Magnesium", "magnesium level"],
  TEST: ["Testosterone", "hormone balance"],
  LH: ["LH", "hormone balance"],
  FSH: ["FSH", "hormone balance"],
  PRL: ["Prolactin", "hormone balance"],
  DHEA: ["DHEA-S", "hormone balance"],
  AMH: ["AMH", "ovarian reserve"],
  E2: ["Estradiol", "hormone balance"],
  BHCG: ["Beta hCG", "pregnancy hormone"],
  CUA: ["Urine Routine", "urine health"],
  CRP: ["CRP", "inflammation"],
  HSCRP: ["hs-CRP", "heart-related inflammation"],
  ESR: ["ESR", "inflammation"],
  URIC: ["Uric Acid", "gout / uric acid"],
  PSA: ["PSA", "prostate health"],
  SEEL: ["Electrolytes", "sodium & potassium"],
  UALB: ["Urine Microalbumin", "early kidney changes"],
};

const SMALL_WORDS = new Set(["and", "of", "for", "with", "in"]);

/**
 * Catalog names are stored in capitals ("THYROID STIMULATING HORMONE
 * (TSH)"); a customer message reads better as "Thyroid Stimulating Hormone
 * (TSH)". Abbreviations — short words, anything with a digit, anything in
 * brackets — keep their capitals.
 */
export function friendlyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  let depth = 0;
  return name
    .split(" ")
    .map((word) => {
      const opens = word.startsWith("(");
      if (opens) depth++;
      const inBrackets = depth > 0;
      if (word.endsWith(")")) depth = Math.max(0, depth - 1);
      const letters = word.replace(/[^A-Z]/g, "");
      if (inBrackets || /\d/.test(word) || letters.length <= 3) {
        return SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word;
      }
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** The name a customer should see for a catalog item. */
export function customerName(item: { code: string; name: string }): string {
  return CUSTOMER_LABELS[item.code.toUpperCase()]?.[0] ?? friendlyName(item.name);
}
