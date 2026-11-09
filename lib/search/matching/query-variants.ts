import { normalizeQuery } from "./normalize-query";

/**
 * The phrasings of one search that are worth matching, so agents can type
 * the way they speak: "I need thyroid test" -> "thyroid", "female health
 * package" -> "female wellness". Pure — vocabulary only, never a medical
 * inference: every variant is still matched against real catalog names,
 * codes and aliases, and nothing is returned that the database doesn't have.
 */

// Conversational words around a test name that name nothing themselves
// (no single letters: "Vitamin A", "Hepatitis A" end in one),
// including common typos of "test".
const CONVERSATIONAL_WORDS = new Set([
  "i", "im", "we", "need", "needs", "needed", "want", "wants", "looking", "look", "for", "the", "to",
  "test", "tests", "testt", "tset", "testing", "check", "checkup", "please", "pls", "plz", "kindly",
  "price", "prices", "cost", "rate", "rates", "of", "my", "me", "do", "you", "have", "is", "there", "what",
  "whats", "how", "much", "get", "done", "can", "show", "find", "search", "about", "some", "any",
]);

// Words that describe a bundle rather than name one — matched away when
// searching package names ("thyroid profile" -> Total Thyroid, Thyro 5).
const BUNDLE_WORDS = new Set([
  "profile", "profiles", "package", "packages", "panel", "panels", "pack", "combo",
  // Common typos of the above.
  "profle", "profil", "prfile", "proflie", "pofile", "pakage", "packge", "pacakge", "pakcage", "packag", "panal",
]);

// Everyday vocabulary that means the same thing in a catalog name. Keys
// can be phrases ("thyroid peroxidase"); they're swapped as whole words.
const SYNONYMS: Record<string, string[]> = {
  sugar: ["glucose"],
  glucose: ["sugar"],
  health: ["wellness"],
  wellness: ["health"],
  female: ["women", "woman"],
  women: ["female"],
  woman: ["female"],
  ladies: ["female", "women"],
  male: ["men", "man"],
  men: ["male"],
  man: ["male"],
  kidney: ["renal"],
  renal: ["kidney"],
  // Doctors write RFT (renal function test) for what the catalog calls KFT.
  rft: ["kft"],
  kft: ["rft"],
  diabetes: ["diabetic"],
  diabetic: ["diabetes"],
  hormone: ["hormones"],
  hormones: ["hormone"],
  // Shorthand agents and doctors use for what the catalog names in full.
  // Anti-TPO is the same antibody the catalog lists as Anti Microsomal.
  tpo: ["anti microsomal"],
  "anti tpo": ["anti microsomal"],
  "thyroid peroxidase": ["anti microsomal"],
  "thyroid peroxidase tpo": ["anti microsomal"],
  "thyroid peroxidase antibody": ["anti microsomal"],
  "thyroid peroxidase tpo antibody": ["anti microsomal"],
  // VDRL / RPR are the everyday names for the syphilis screen.
  vdrl: ["syphilis"],
  rpr: ["syphilis"],
  // Hb / CBP / FBC all mean the complete blood count (Hemogram).
  hb: ["hemogram"],
  hemoglobin: ["hemogram"],
  cbp: ["hemogram"],
  fbc: ["hemogram"],
  "complete blood picture": ["hemogram"],
  pregnancy: ["beta hcg"],
  d3: ["vitamin d"],
  potassium: ["electrolytes"],

  // Everyday lab shorthand <-> the names catalogs spell out. Each is only a
  // phrasing to also try: it still has to match a real catalog name, code
  // or alias, so a pair the catalog doesn't use simply finds nothing.
  vit: ["vitamin"],
  "vit d3": ["vitamin d"],
  "vitamin d3": ["vitamin d"],
  b12: ["vitamin b12"],
  folate: ["folic acid"],
  "folic acid": ["folate"],
  cbc: ["hemogram", "complete blood count"],
  hemogram: ["cbc"],
  "complete blood count": ["cbc", "hemogram"],
  lft: ["liver function"],
  "liver function": ["lft"],
  "liver profile": ["liver function"],
  "kidney function": ["kft", "renal function"],
  "kidney profile": ["kidney function"],
  tft: ["thyroid profile"],
  "thyroid function": ["thyroid profile"],
  "t3 t4 tsh": ["thyroid profile"],
  sgpt: ["alt"],
  alt: ["sgpt"],
  sgot: ["ast"],
  ast: ["sgot"],
  alp: ["alkaline phosphatase"],
  ggt: ["gamma gt"],
  ldh: ["lactate dehydrogenase"],
  cpk: ["creatine kinase"],
  bun: ["blood urea nitrogen", "urea"],
  a1c: ["hba1c"],
  "glycated hemoglobin": ["hba1c"],
  "glycosylated hemoglobin": ["hba1c"],
  fbs: ["glucose fasting", "fasting blood sugar"],
  "fasting sugar": ["glucose fasting"],
  ppbs: ["glucose post prandial"],
  rbs: ["glucose random"],
  cholesterol: ["lipid"],
  esr: ["erythrocyte sedimentation rate"],
  crp: ["c reactive protein"],
  "c reactive protein": ["crp"],
  "iron studies": ["iron profile"],
  "iron profile": ["iron studies"],
  psa: ["prostate specific antigen"],
  hcg: ["beta hcg"],
  prl: ["prolactin"],
  e2: ["estradiol"],
  ana: ["antinuclear antibody"],
  rf: ["rheumatoid factor"],
  "ra factor": ["rheumatoid factor"],
  aso: ["antistreptolysin o"],
  hbsag: ["hepatitis b surface antigen"],
  hcv: ["hepatitis c"],
  inr: ["prothrombin time"],
  "pt inr": ["prothrombin time"],
  urinalysis: ["urine routine", "urine analysis"],
  "urine re": ["urine routine"],
  mg: ["magnesium"],
  lytes: ["electrolytes"],
  acr: ["albumin creatinine ratio"],
};

/** Most variants tried per query, the original first. */
const MAX_VARIANTS = 8;

// Longest phrases first, so "thyroid peroxidase tpo" is swapped whole
// before "tpo" gets a chance on its own.
const SYNONYM_KEYS = Object.keys(SYNONYMS).sort((a, b) => b.split(" ").length - a.split(" ").length);

function stripWords(normalized: string, drop: Set<string>): string {
  const words = normalized.split(" ");
  const kept = words.filter((word) => !drop.has(word));
  // Everything was filler ("test"): keep the query as typed.
  return kept.length > 0 ? kept.join(" ") : normalized;
}

/**
 * Normalized variants of a query, original first. `forPackages` also drops
 * bundle words ("profile", "package") since package names often omit them.
 */
export function queryVariants(raw: string, options: { forPackages?: boolean } = {}): string[] {
  const normalized = normalizeQuery(raw);
  if (!normalized) return [];

  const variants = [normalized];
  const add = (value: string) => {
    if (value && !variants.includes(value) && variants.length < MAX_VARIANTS) variants.push(value);
  };

  let cleaned = stripWords(normalized, CONVERSATIONAL_WORDS);
  if (options.forPackages) cleaned = stripWords(cleaned, BUNDLE_WORDS);
  add(cleaned);

  // One synonym swap at a time (a word or a whole phrase), on the cleaned phrasing.
  const padded = ` ${cleaned} `;
  for (const key of SYNONYM_KEYS) {
    if (!padded.includes(` ${key} `)) continue;
    for (const synonym of SYNONYMS[key]) {
      add(padded.replace(` ${key} `, ` ${synonym} `).trim());
    }
  }

  return variants;
}

/** Score kept for a match found only through a rephrased variant, vs. the query as typed. */
export const VARIANT_SCORE_FACTOR = 0.97;
