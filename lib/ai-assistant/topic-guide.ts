import type { AiRelevanceLevel } from "@/types/ai-assistant";

/**
 * Built-in topic guide for the AI Test Assistant: common customer concerns
 * mapped to the catalog tests/packages usually discussed for them. It's the
 * assistant's always-on engine (no API key needed) and its fallback when
 * Gemini is unavailable.
 *
 * Items name catalog codes only — each is looked up in the database and
 * dropped if it isn't sold at the agent's location, so nothing here can put
 * an invented test or price on screen. `codes` lists alternatives, first
 * priced one wins (e.g. a test code, then its package). An item whose codes
 * are all unavailable feeds the "some clinically relevant tests may not be
 * available" note instead; `codes: []` marks a test the catalog doesn't
 * carry at all.
 *
 * Deliberately conservative: only tests with a direct, commonly accepted
 * link to the topic — never a test just because its name sounds related
 * (no AMH for weight loss).
 */
export interface TopicItem {
  codes: string[];
  /** Plain name, used when the test isn't available here. */
  label: string;
  level: AiRelevanceLevel;
  reason: string;
}

export interface Topic {
  id: string;
  label: string;
  /** Normalized phrases (lowercase, single-spaced) that signal this topic. */
  keywords: string[];
  items: TopicItem[];
}

const HBA1C: TopicItem = { codes: ["HBA"], label: "HbA1c", level: "high", reason: "Average blood sugar over ~3 months" };
const FBS: TopicItem = { codes: ["FBS"], label: "Fasting Blood Sugar", level: "high", reason: "Blood glucose assessment" };
const LIPID: TopicItem = { codes: ["LIPID"], label: "Lipid Profile", level: "high", reason: "Cholesterol and lipid assessment" };
const LFT: TopicItem = { codes: ["LFT"], label: "Liver Function Tests", level: "high", reason: "General liver assessment" };
const KFT: TopicItem = { codes: ["KFT"], label: "Kidney Function Tests", level: "high", reason: "General kidney assessment" };
const TSH: TopicItem = { codes: ["TSH", "TFT"], label: "TSH", level: "high", reason: "Thyroid function screening" };
const CBC: TopicItem = { codes: ["H6"], label: "Complete Blood Count", level: "high", reason: "Blood count, haemoglobin and anaemia check" };
const FERRITIN: TopicItem = { codes: ["FERR"], label: "Ferritin", level: "high", reason: "Body iron stores" };
const VIT_D: TopicItem = { codes: ["VITDC", "VITD3"], label: "Vitamin D", level: "high", reason: "Vitamin D status" };
const VIT_B12: TopicItem = { codes: ["VITB"], label: "Vitamin B12", level: "high", reason: "Vitamin B12 status" };
const URINE: TopicItem = { codes: ["CUA", "UROG"], label: "Complete Urine Analysis", level: "high", reason: "Routine urine examination" };

const medium = (item: TopicItem, reason = item.reason): TopicItem => ({ ...item, level: "medium", reason });

export const TOPICS: Topic[] = [
  {
    id: "weight",
    label: "Weight management",
    keywords: [
      "lose weight", "losing weight", "weight loss", "weight lose", "reduce weight", "weight reduction",
      "weight management", "weight gain", "gaining weight", "obesity", "obese", "overweight", "fat loss",
      "slimming", "bmi", "ozempic", "wegovy", "mounjaro", "saxenda", "semaglutide", "tirzepatide", "liraglutide",
    ],
    items: [
      { ...HBA1C, reason: "Diabetes / glucose assessment" },
      FBS,
      LIPID,
      LFT,
      KFT,
      { ...TSH, reason: "Thyroid function can affect weight" },
      { codes: ["INSFA"], label: "Insulin - Fasting", level: "medium", reason: "Insulin resistance assessment" },
      medium(CBC, "General blood count"),
      medium(VIT_D),
    ],
  },
  {
    id: "diabetes",
    label: "Diabetes / glucose assessment",
    keywords: [
      "diabetes", "diabetic", "prediabetes", "sugar", "pre diabetes", "blood sugar", "sugar level", "sugar check",
      "sugar test", "high sugar", "glucose", "insulin resistance",
    ],
    items: [
      HBA1C,
      FBS,
      { codes: ["PPBS"], label: "Postprandial Blood Sugar", level: "medium", reason: "Blood sugar after a meal" },
      { codes: ["INSFA"], label: "Insulin - Fasting", level: "medium", reason: "Insulin resistance assessment" },
      medium(KFT, "Kidney assessment, commonly monitored in diabetes"),
      { codes: ["UALB"], label: "Urine Microalbumin", level: "medium", reason: "Early kidney check commonly done in diabetes" },
      medium(LIPID, "Cholesterol, commonly checked alongside glucose"),
    ],
  },
  {
    id: "hair",
    label: "Hair loss",
    keywords: ["hair fall", "hairfall", "hair loss", "losing hair", "hair thinning", "thinning hair", "alopecia", "baldness", "bald"],
    items: [
      { ...FERRITIN, reason: "Low iron stores are a common factor in hair fall" },
      { ...TSH, reason: "Thyroid imbalance can cause hair fall" },
      { ...VIT_D, reason: "Vitamin D status, often checked in hair fall" },
      { ...CBC, reason: "Anaemia check" },
      medium(VIT_B12),
      { codes: ["SEZN", "BTEZN"], label: "Zinc", level: "medium", reason: "Zinc status" },
    ],
  },
  {
    id: "fatigue",
    label: "Tiredness / low energy",
    keywords: [
      "tired", "tiredness", "fatigue", "fatigued", "exhausted", "exhaustion", "low energy", "no energy",
      "weakness", "weak", "lethargic", "lethargy", "sleepy",
    ],
    items: [
      { ...CBC, reason: "Anaemia and blood count check" },
      { ...FERRITIN, reason: "Low iron stores can cause tiredness" },
      { ...TSH, reason: "Thyroid imbalance can cause tiredness" },
      { ...VIT_B12, reason: "Low B12 can cause tiredness" },
      VIT_D,
      medium(HBA1C, "Blood sugar assessment"),
      { codes: ["FOLI", "VITB9"], label: "Folate", level: "medium", reason: "Folate status" },
    ],
  },
  {
    id: "pcos",
    label: "PCOS / hormonal assessment",
    keywords: ["pcos", "pcod", "polycystic", "irregular periods", "irregular period", "irregular menses", "hirsutism", "facial hair"],
    items: [
      { codes: ["TEST"], label: "Testosterone", level: "high", reason: "Androgen levels, key in PCOS assessment" },
      { codes: ["LH"], label: "LH", level: "high", reason: "Reproductive hormone, commonly checked in PCOS" },
      { codes: ["FSH"], label: "FSH", level: "high", reason: "Reproductive hormone, commonly checked in PCOS" },
      { codes: ["PRL"], label: "Prolactin", level: "high", reason: "Rules out other causes of irregular cycles" },
      { ...TSH, reason: "Thyroid issues can mimic PCOS symptoms" },
      { codes: ["DHEA"], label: "DHEA-S", level: "medium", reason: "Adrenal androgen" },
      { codes: ["SHBG"], label: "SHBG", level: "medium", reason: "Helps interpret testosterone levels" },
      { codes: ["17OH"], label: "17-OH Progesterone", level: "medium", reason: "Rules out an adrenal cause" },
      medium(HBA1C, "Glucose assessment — PCOS is linked to insulin resistance"),
      { codes: ["INSFA"], label: "Insulin - Fasting", level: "medium", reason: "Insulin resistance assessment" },
      medium(LIPID, "Cholesterol assessment"),
      { codes: ["AMH"], label: "AMH", level: "medium", reason: "Sometimes used as a supportive marker in PCOS" },
    ],
  },
  {
    id: "thyroid",
    label: "Thyroid assessment",
    keywords: ["thyroid", "hypothyroid", "hypothyroidism", "hyperthyroid", "hyperthyroidism", "goitre", "goiter"],
    items: [
      { ...TSH, reason: "Main thyroid screening test" },
      { codes: ["FT4"], label: "Free T4", level: "high", reason: "Thyroid hormone level" },
      { codes: ["FT3"], label: "Free T3", level: "high", reason: "Thyroid hormone level" },
      { codes: ["AMA"], label: "Anti-TPO (Anti-microsomal)", level: "medium", reason: "Autoimmune thyroid antibodies" },
      { codes: ["ATG"], label: "Anti-Thyroglobulin", level: "medium", reason: "Autoimmune thyroid antibodies" },
    ],
  },
  {
    id: "heart",
    label: "Heart / cholesterol",
    keywords: ["heart", "cardiac", "cholesterol", "cholestrol", "triglycerides", "heart attack", "heart health"],
    items: [
      { ...LIPID, reason: "Cholesterol and lipid assessment" },
      { codes: ["HSCRP"], label: "hs-CRP", level: "medium", reason: "Inflammation marker used in heart risk assessment" },
      medium(HBA1C, "Diabetes is a heart risk factor"),
      { codes: ["LPA"], label: "Lipoprotein (a)", level: "medium", reason: "Inherited heart risk marker" },
      { codes: ["APOB"], label: "Apolipoprotein B", level: "medium", reason: "Advanced lipid marker" },
      { codes: ["HOMO"], label: "Homocysteine", level: "medium", reason: "Heart risk marker" },
    ],
  },
  {
    id: "blood-pressure",
    label: "Blood pressure",
    keywords: ["blood pressure", "high bp", "low bp", "bp", "hypertension"],
    items: [
      { ...KFT, reason: "Kidney assessment, commonly checked with high blood pressure" },
      { codes: ["SEEL"], label: "Serum Electrolytes", level: "high", reason: "Sodium / potassium balance" },
      medium(LIPID, "Cholesterol, a related heart risk factor"),
      medium(HBA1C, "Blood sugar, a related risk factor"),
      medium(URINE),
    ],
  },
  {
    id: "liver",
    label: "Liver health",
    keywords: ["liver", "fatty liver", "jaundice", "hepatitis", "alcohol"],
    items: [
      { ...LFT, reason: "Liver enzymes, bilirubin and proteins" },
      { codes: ["GGT"], label: "GGT", level: "medium", reason: "Liver enzyme" },
      { codes: ["CSAG"], label: "Hepatitis B Surface Antigen", level: "medium", reason: "Hepatitis B screening" },
      { codes: ["CHCV"], label: "Hepatitis C Antibody", level: "medium", reason: "Hepatitis C screening" },
    ],
  },
  {
    id: "kidney",
    label: "Kidney health",
    keywords: ["kidney", "kidneys", "renal", "kidney stone", "kidney stones"],
    items: [
      { ...KFT, reason: "Creatinine, urea and related kidney markers" },
      { ...URINE, reason: "Urine examination for kidney-related changes" },
      { codes: ["SEEL"], label: "Serum Electrolytes", level: "medium", reason: "Sodium / potassium balance" },
      { codes: ["UALB"], label: "Urine Microalbumin", level: "medium", reason: "Early kidney damage marker" },
      { codes: ["URIC"], label: "Uric Acid", level: "medium", reason: "Related to some kidney stones" },
    ],
  },
  {
    id: "anaemia",
    label: "Anaemia / iron",
    keywords: ["anemia", "anaemia", "anemic", "anaemic", "low hemoglobin", "low haemoglobin", "low hb", "iron deficiency", "pale"],
    items: [
      { ...CBC, reason: "Haemoglobin and red cell indices" },
      FERRITIN,
      { codes: ["IRON"], label: "Serum Iron", level: "high", reason: "Iron level" },
      { codes: ["TIBC"], label: "TIBC", level: "high", reason: "Iron binding capacity" },
      medium(VIT_B12, "B12 deficiency can cause anaemia"),
      { codes: ["FOLI", "VITB9"], label: "Folate", level: "medium", reason: "Folate deficiency can cause anaemia" },
    ],
  },
  {
    id: "vitamins",
    label: "Vitamin / nutrient status",
    keywords: ["vitamin", "vitamins", "deficiency", "nutrient", "nutrients", "nutrition", "vitamin deficiency"],
    items: [
      VIT_D,
      VIT_B12,
      medium(FERRITIN),
      { codes: ["FOLI", "VITB9"], label: "Folate", level: "medium", reason: "Folate status" },
      { codes: ["CALC"], label: "Calcium", level: "medium", reason: "Calcium level" },
      { codes: ["MG"], label: "Magnesium", level: "medium", reason: "Magnesium level" },
    ],
  },
  {
    id: "joints",
    label: "Joint pain / arthritis",
    keywords: ["joint pain", "joints", "arthritis", "rheumatoid", "gout", "knee pain", "swollen joints", "joint swelling"],
    items: [
      { codes: ["RFAC"], label: "Rheumatoid Factor", level: "high", reason: "Rheumatoid arthritis marker" },
      { codes: ["ACCP"], label: "Anti-CCP", level: "high", reason: "Rheumatoid arthritis marker" },
      { codes: ["URIC"], label: "Uric Acid", level: "high", reason: "Gout assessment" },
      { codes: ["CRP"], label: "CRP", level: "medium", reason: "Inflammation marker" },
      { codes: ["ESR"], label: "ESR", level: "medium", reason: "Inflammation marker" },
      { codes: ["ANA"], label: "ANA", level: "medium", reason: "Autoimmune screening" },
      medium(VIT_D),
    ],
  },
  {
    id: "bones",
    label: "Bone health",
    keywords: ["bone", "bones", "osteoporosis", "bone density", "back pain", "muscle cramps", "cramps"],
    items: [
      { ...VIT_D, reason: "Vitamin D is key for bone health" },
      { codes: ["CALC"], label: "Calcium", level: "high", reason: "Calcium level" },
      { codes: ["PHOS"], label: "Phosphorus", level: "medium", reason: "Bone mineral" },
      { codes: ["ALKP"], label: "Alkaline Phosphatase", level: "medium", reason: "Bone turnover marker" },
      { codes: ["PTH"], label: "Parathyroid Hormone", level: "medium", reason: "Regulates calcium" },
      { codes: ["MG"], label: "Magnesium", level: "medium", reason: "Magnesium level" },
    ],
  },
  {
    id: "female-fertility",
    label: "Female fertility",
    keywords: [
      "fertility", "infertility", "trying to conceive", "trying for baby", "get pregnant", "getting pregnant",
      "ovarian reserve", "egg reserve", "egg count", "ivf",
    ],
    items: [
      { codes: ["AMH"], label: "AMH", level: "high", reason: "Ovarian reserve marker" },
      { codes: ["FSH"], label: "FSH", level: "high", reason: "Reproductive hormone" },
      { codes: ["LH"], label: "LH", level: "high", reason: "Reproductive hormone" },
      { codes: ["E2"], label: "Estradiol", level: "high", reason: "Reproductive hormone" },
      { codes: ["PRL"], label: "Prolactin", level: "high", reason: "High prolactin can affect fertility" },
      TSH,
      { codes: ["PROG"], label: "Progesterone", level: "medium", reason: "Ovulation assessment" },
      { codes: ["RB_G"], label: "Rubella IgG", level: "medium", reason: "Rubella immunity before pregnancy" },
    ],
  },
  {
    id: "mens-health",
    label: "Men's hormonal health",
    keywords: ["testosterone", "low libido", "libido", "erectile", "male fertility", "sperm", "semen", "mens health", "men health"],
    items: [
      { codes: ["TEST"], label: "Testosterone", level: "high", reason: "Main male hormone" },
      { codes: ["FTES"], label: "Free Testosterone", level: "medium", reason: "Active testosterone" },
      { codes: ["LH"], label: "LH", level: "medium", reason: "Controls testosterone production" },
      { codes: ["FSH"], label: "FSH", level: "medium", reason: "Reproductive hormone" },
      { codes: ["PRL"], label: "Prolactin", level: "medium", reason: "High prolactin can lower libido" },
      { codes: ["SHBG"], label: "SHBG", level: "medium", reason: "Helps interpret testosterone levels" },
      medium(HBA1C, "Blood sugar assessment"),
      { codes: [], label: "Semen Analysis", level: "medium", reason: "Male fertility assessment" },
    ],
  },
  {
    id: "pregnancy",
    label: "Pregnancy",
    keywords: ["pregnant", "pregnancy", "missed period", "late period", "antenatal", "prenatal"],
    items: [
      { codes: ["BHCG"], label: "Beta hCG", level: "high", reason: "Pregnancy confirmation" },
      medium(CBC, "Routine antenatal blood count"),
      { codes: ["BGRT"], label: "Blood Group & Rh", level: "medium", reason: "Routine antenatal test" },
      medium(TSH, "Thyroid, routinely checked in pregnancy"),
      medium(FBS, "Blood sugar, routinely checked in pregnancy"),
      medium(URINE, "Routine antenatal urine test"),
      { codes: ["CSAG"], label: "Hepatitis B Surface Antigen", level: "medium", reason: "Routine antenatal screening" },
      { codes: ["CHIV"], label: "HIV", level: "medium", reason: "Routine antenatal screening" },
      { codes: ["SYPHILIS", "TPAB"], label: "Syphilis", level: "medium", reason: "Routine antenatal screening" },
      { codes: ["RB_G"], label: "Rubella IgG", level: "medium", reason: "Rubella immunity" },
    ],
  },
  {
    id: "menopause",
    label: "Menopause",
    keywords: ["menopause", "perimenopause", "hot flashes", "hot flushes"],
    items: [
      { codes: ["FSH"], label: "FSH", level: "high", reason: "Commonly checked around menopause" },
      { codes: ["E2"], label: "Estradiol", level: "high", reason: "Oestrogen level" },
      medium(TSH, "Thyroid issues can mimic menopause symptoms"),
      medium(VIT_D, "Bone health after menopause"),
      medium(LIPID, "Cholesterol tends to change after menopause"),
    ],
  },
  {
    id: "general",
    label: "General health check-up",
    keywords: [
      "full body", "full body checkup", "general checkup", "general check up", "health checkup", "health check",
      "routine checkup", "routine check up", "annual checkup", "master checkup", "wellness", "medical checkup",
      "basic checkup", "overall health",
    ],
    items: [
      { ...CBC, reason: "General blood count" },
      FBS,
      medium(HBA1C),
      LIPID,
      LFT,
      KFT,
      TSH,
      URINE,
      medium(VIT_D),
      medium(VIT_B12),
    ],
  },
  {
    id: "fever",
    label: "Fever / infection",
    keywords: ["fever", "infection", "viral", "typhoid", "flu"],
    items: [
      { ...CBC, reason: "White cell and platelet counts" },
      { codes: ["CRP"], label: "CRP", level: "high", reason: "Inflammation / infection marker" },
      { codes: ["ESR"], label: "ESR", level: "medium", reason: "Inflammation marker" },
      medium(URINE, "Checks for urinary infection"),
      { codes: [], label: "Typhoid (Widal / blood culture)", level: "medium", reason: "Typhoid assessment" },
    ],
  },
  {
    id: "dengue",
    label: "Dengue",
    keywords: ["dengue"],
    items: [
      { codes: ["NS1"], label: "Dengue NS1 Antigen", level: "high", reason: "Early dengue detection" },
      { codes: ["DG_M"], label: "Dengue IgM", level: "high", reason: "Recent dengue infection" },
      { codes: ["DG_G"], label: "Dengue IgG", level: "medium", reason: "Past / secondary dengue infection" },
      { ...CBC, reason: "Platelet count monitoring" },
    ],
  },
  {
    id: "uti",
    label: "Urinary symptoms",
    keywords: ["uti", "urine infection", "urinary infection", "burning urine", "burning urination", "frequent urination"],
    items: [
      { ...URINE, reason: "Urine examination for infection" },
      { codes: [], label: "Urine Culture", level: "high", reason: "Identifies the infecting organism" },
      medium(FBS, "Frequent urination can relate to blood sugar"),
    ],
  },
  {
    id: "sexual-health",
    label: "Sexual health screening",
    keywords: ["std", "sti", "sexual health", "sexually transmitted", "hiv", "syphilis", "herpes", "chlamydia", "unprotected"],
    items: [
      { codes: ["CHIV"], label: "HIV", level: "high", reason: "HIV screening" },
      { codes: ["SYPHILIS", "TPAB"], label: "Syphilis", level: "high", reason: "Syphilis screening" },
      { codes: ["CSAG"], label: "Hepatitis B Surface Antigen", level: "high", reason: "Hepatitis B screening" },
      { codes: ["CHCV"], label: "Hepatitis C Antibody", level: "high", reason: "Hepatitis C screening" },
      { codes: ["CHS2G"], label: "HSV-2 IgG", level: "medium", reason: "Herpes screening" },
      { codes: ["CHL_G"], label: "Chlamydia IgG", level: "medium", reason: "Chlamydia antibody screening" },
    ],
  },
  {
    id: "allergy",
    label: "Allergy",
    keywords: ["allergy", "allergies", "allergic", "sneezing", "hives", "itching", "asthma", "rhinitis"],
    items: [
      { codes: ["TIGE", "IGE"], label: "Total IgE", level: "high", reason: "Overall allergy marker" },
      { codes: ["APPHA"], label: "Phadiatop (inhaled allergen screen)", level: "medium", reason: "Screens common inhaled allergens" },
      { codes: ["APASTS"], label: "Asthma / Rhinitis Allergy Screen", level: "medium", reason: "Inhaled allergen panel" },
      { codes: ["APFP1"], label: "Food Allergy Panel", level: "medium", reason: "Common food allergens" },
      { codes: ["AEOS"], label: "Eosinophil Count", level: "medium", reason: "Often raised in allergy" },
    ],
  },
  {
    id: "stomach",
    label: "Stomach / digestion",
    keywords: ["acidity", "gastritis", "ulcer", "h pylori", "stomach pain", "indigestion", "heartburn"],
    items: [
      { codes: ["HPYG"], label: "H. pylori IgG", level: "high", reason: "H. pylori, a common cause of gastritis/ulcers" },
      medium(CBC, "Anaemia check"),
      { codes: [], label: "H. pylori Stool Antigen / Breath Test", level: "medium", reason: "Active H. pylori infection" },
    ],
  },
  {
    id: "gluten",
    label: "Gluten intolerance / celiac",
    keywords: ["gluten", "celiac", "coeliac", "wheat intolerance"],
    items: [
      { codes: ["TTGAA"], label: "tTG IgA", level: "high", reason: "Main celiac screening test" },
      { codes: ["DGP-G"], label: "Deamidated Gliadin IgG", level: "medium", reason: "Celiac antibody" },
      { codes: ["IGA"], label: "Total IgA", level: "medium", reason: "Helps interpret the tTG IgA result" },
    ],
  },
  {
    id: "acne",
    label: "Acne / skin (hormonal)",
    keywords: ["acne", "pimples", "pimple", "breakouts"],
    items: [
      { codes: ["TEST"], label: "Testosterone", level: "medium", reason: "Androgens can drive acne" },
      { codes: ["DHEA"], label: "DHEA-S", level: "medium", reason: "Adrenal androgen" },
      { codes: ["LH"], label: "LH", level: "medium", reason: "Hormonal assessment" },
      { codes: ["FSH"], label: "FSH", level: "medium", reason: "Hormonal assessment" },
    ],
  },
  {
    id: "surgery",
    label: "Pre-surgery assessment",
    keywords: ["surgery", "operation", "pre op", "preop", "pre operative", "pre surgery", "procedure"],
    items: [
      { ...CBC, reason: "Routine pre-operative blood count" },
      { codes: ["BGRT"], label: "Blood Group & Rh", level: "high", reason: "Routine pre-operative test" },
      { ...FBS, reason: "Routine pre-operative blood sugar" },
      medium(HBA1C, "Blood sugar control"),
      { ...KFT, reason: "Routine pre-operative kidney assessment" },
      { codes: ["SEEL"], label: "Serum Electrolytes", level: "medium", reason: "Sodium / potassium balance" },
      { codes: ["CSAG"], label: "Hepatitis B Surface Antigen", level: "medium", reason: "Routine pre-operative screening" },
      { codes: ["CHCV"], label: "Hepatitis C Antibody", level: "medium", reason: "Routine pre-operative screening" },
      { codes: ["CHIV"], label: "HIV", level: "medium", reason: "Routine pre-operative screening" },
      { codes: [], label: "PT / INR (clotting)", level: "high", reason: "Blood clotting before surgery" },
    ],
  },
  {
    id: "prostate",
    label: "Prostate health",
    keywords: ["prostate", "psa"],
    items: [
      { codes: ["PSA"], label: "PSA", level: "high", reason: "Prostate marker" },
      { codes: ["FPSA"], label: "Free PSA", level: "medium", reason: "Helps interpret PSA" },
      medium(URINE),
    ],
  },
  {
    id: "fitness",
    label: "Fitness / gym",
    keywords: ["gym", "fitness", "athlete", "bodybuilding", "muscle gain", "workout", "sports"],
    items: [
      medium(CBC, "General blood count"),
      medium(VIT_D),
      { codes: ["TEST"], label: "Testosterone", level: "medium", reason: "Hormone relevant to muscle building" },
      medium(KFT, "Kidney assessment (e.g. with high protein intake or supplements)"),
      medium(LFT, "Liver assessment (e.g. with supplements)"),
      medium(LIPID),
      { codes: ["CPK"], label: "CPK", level: "medium", reason: "Muscle enzyme" },
    ],
  },
];

/**
 * Baseline checks added when the customer asks about tests before starting
 * a medicine/treatment — organ function and glucose are the usual pre-
 * treatment baseline regardless of topic.
 */
export const PRE_TREATMENT_ITEMS: TopicItem[] = [
  medium(LFT, "Baseline liver assessment before starting medication"),
  medium(KFT, "Baseline kidney assessment before starting medication"),
  medium(CBC, "Baseline blood count"),
  medium(HBA1C, "Baseline glucose assessment"),
];

export const PRE_TREATMENT_PATTERN =
  /\b(before|prior to|start|starting|begin|beginning)\b.*\b(medicine|medicines|medication|medications|treatment|drug|drugs|injection|injections|tablet|tablets|pills?|therapy)\b/;
