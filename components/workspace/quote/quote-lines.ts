import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";
import type { QuotationLineItem, QuotationPackageLine, QuotationTestLine } from "@/types/quotation";

/** A search result as a quote line. */
export function toTestLine(result: SearchTestResult): QuotationTestLine {
  return {
    kind: "test",
    testId: result.testId,
    code: result.code,
    name: result.officialName,
    price: result.price,
    tatText: result.tatText,
    serviceType: result.serviceType,
    availability: result.availability,
  };
}

/** A profile/package result or suggestion as a quote line. */
export function toPackageLine(result: ProfileSearchResult | ProfileSuggestion): QuotationPackageLine {
  return {
    kind: "package",
    profileId: result.profileId,
    code: result.code,
    name: result.name,
    tests: result.tests,
    price: result.price,
    tatText: result.tatText,
    serviceType: result.serviceType,
    availability: result.availability,
  };
}

/** The key removeLineItem() needs for a line. */
export function lineKey(item: QuotationLineItem) {
  return item.kind === "test"
    ? ({ kind: "test", testId: item.testId } as const)
    : ({ kind: "package", profileId: item.profileId } as const);
}
