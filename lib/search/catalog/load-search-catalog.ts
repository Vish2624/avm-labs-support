import "server-only";
import { listActiveTests } from "@/lib/database/tests";
import { listActiveAliases } from "@/lib/database/aliases";
import { browseProfiles, browseTests } from "./browse-catalog";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchCatalog } from "./search-catalog";

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
    tests: tests.map(({ id, code, officialName, shortName }) => ({ id, code, officialName, shortName })),
    aliases: aliases.map(({ testId, alias, normalizedAlias, confidence }) => ({ testId, alias, normalizedAlias, confidence })),
    priced,
    profiles,
  };
}

/** The URL the browser fetches a catalog from — also the key it's cached under. */
export function searchCatalogUrl(locationId: string, serviceType: ServiceType): string {
  return `/api/search/catalog?${new URLSearchParams({ locationId, serviceType })}`;
}
