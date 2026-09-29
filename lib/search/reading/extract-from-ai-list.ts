import "server-only";
import { extractTests, type ExtractTestsResult } from "./extract-tests";
import { isPackageName } from "../matching/is-package-name";
import type { ServiceType } from "@/lib/constants/service-types";

/**
 * Prices what a Gemini reader picked (aiListRequestedTests /
 * aiReadImageTests): its catalog codes go through extractTests(), and the
 * items it marked as not listed are reported as not available — unless the
 * rule-based reader recognises one exactly (a code, name or alias, e.g.
 * "CBP" for the Hemogram), which is a real match Gemini missed. Fuzzy
 * guesses are never taken for them: that is how "vitamin K" would become
 * Potassium (K). Packages are left out; the paste tab shows tests and
 * profiles only.
 */
export async function extractFromAiList(
  aiList: { codes: string; notListed: string[] },
  locationId: string,
  serviceTypes: readonly ServiceType[]
): Promise<ExtractTestsResult> {
  const [fromCodes, ...fromNames] = await Promise.all([
    extractTests(aiList.codes, locationId, serviceTypes),
    ...aiList.notListed.map((name) => extractTests(name, locationId, serviceTypes)),
  ]);

  const detected = [...fromCodes.detected];
  const seen = new Set(detected.map((result) => `${result.testId}|${result.serviceType}`));
  const stillMissing: string[] = [];
  aiList.notListed.forEach((name, i) => {
    const rules = fromNames[i];
    const recognised =
      rules.detected.length > 0 &&
      rules.unmatched.length === 0 &&
      rules.detected.every((result) => result.matchType === "exact");
    if (!recognised) {
      stillMissing.push(name);
      return;
    }
    for (const result of rules.detected) {
      const key = `${result.testId}|${result.serviceType}`;
      if (!seen.has(key)) {
        seen.add(key);
        detected.push(result);
      }
    }
  });

  return {
    ...fromCodes,
    detected,
    packages: fromCodes.packages.filter(({ result }) => !isPackageName(result.name)),
    unmatched: [...new Set([...fromCodes.unmatched, ...stillMissing])],
  };
}
