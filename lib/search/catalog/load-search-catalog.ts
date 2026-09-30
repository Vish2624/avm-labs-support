import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { browseProfiles, browseTests } from "./browse-catalog";
import type { ServiceType } from "@/lib/constants/service-types";
import type { Test } from "@/types/test";
import type { CatalogCalculatedParameter, SearchCatalog } from "./search-catalog";

/**
 * A calculated parameter's orderable tests: its sources, with any source
 * that is itself calculated replaced by that one's sources (depth-first,
 * deduped, cycle-safe).
 */
function orderableSources(test: Test, testById: Map<string, Test>, seen = new Set<string>([test.id])): string[] {
  const ids: string[] = [];
  for (const sourceId of test.sourceTestIds) {
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const source = testById.get(sourceId);
    if (!source) continue;
    if (source.testType === "calculated") ids.push(...orderableSources(source, testById, seen));
    else ids.push(sourceId);
  }
  return [...new Set(ids)];
}

function toCatalogCalculated(tests: Test[]): CatalogCalculatedParameter[] {
  const testById = new Map(tests.map((test) => [test.id, test]));
  return tests
    .filter((test) => test.testType === "calculated")
    .map((test) => ({
      id: test.id,
      code: test.code,
      officialName: test.officialName,
      shortName: test.shortName,
      description: test.description,
      sourceNames: test.sourceTestIds.flatMap((id) => testById.get(id)?.officialName ?? []),
      orderTestIds: orderableSources(test, testById),
      viaProfileCode: test.viaProfileCode,
    }));
}

/**
 * The Quote search box's catalog for one location + service type — every
 * active test and alias (to match against) plus the tests and profiles
 * priced here, with only the fields matching needs. Served by
 * /api/search/catalog, and rendered straight into the Quote page so the
 * first search doesn't wait for a separate download. From the server's
 * cached catalog snapshot; prices are real current DB rows.
 */
export async function loadSearchCatalog(locationId: string, serviceType: ServiceType): Promise<SearchCatalog> {
  const [tests, aliases, priced, profiles] = await Promise.all([
    listActiveTests(),
    listActiveAliases(),
    browseTests(locationId, serviceType),
    browseProfiles(locationId, serviceType),
  ]);
  return {
    // Calculated parameters are matched separately (catalog.calculated); a
    // parameter keeps its componentIds so a match on it finds its component.
    tests: tests
      .filter((test) => test.testType !== "calculated")
      .map(({ id, code, officialName, shortName, componentIds }) =>
        componentIds.length > 0 ? { id, code, officialName, shortName, componentIds } : { id, code, officialName, shortName }
      ),
    aliases: aliases.map(({ testId, alias, normalizedAlias, confidence }) => ({ testId, alias, normalizedAlias, confidence })),
    priced,
    profiles,
    calculated: toCatalogCalculated(tests),
  };
}

/** The URL the browser fetches a catalog from — also the key it's cached under. */
export function searchCatalogUrl(locationId: string, serviceType: ServiceType): string {
  return `/api/search/catalog?${new URLSearchParams({ locationId, serviceType })}`;
}
