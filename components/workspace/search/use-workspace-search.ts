"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  searchCatalogCalculated,
  searchCatalogProfiles,
  searchCatalogTests,
  type SearchCatalog,
} from "@/lib/search/catalog/search-catalog";
import { fetcher } from "@/lib/utils/fetcher";
import { SERVICE_TYPES, type ServiceType, type ServiceTypeFilter } from "@/lib/constants/service-types";
import type { CalculatedSearchResult, SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";
import type { SearchResultGroup } from "./search-results";
import { useSearchTelemetry } from "./use-search-telemetry";

// Search runs locally in the browser (~10 ms), so only a tiny pause is needed.
const SEARCH_DEBOUNCE_MS = 50;
/** How often the loaded search catalog is refreshed in the background (so price changes come through). */
const CATALOG_REFRESH_MS = 2 * 60_000;
/** A profile whose own name matches the search at least this well (0-100) counts as an exact match. */
const EXACT_PROFILE_SCORE = 90;
/** Gemini is only asked for searches at least this long (not "t", "ts"). */
const AI_SEARCH_MIN_LENGTH = 3;

const EMPTY_TEST_RESULTS: SearchTestResult[] = [];
const EMPTY_PROFILE_RESULTS: ProfileSearchResult[] = [];
export const EMPTY_CALCULATED_RESULTS: CalculatedSearchResult[] = [];

const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Instant search: each location + service type's catalog (tests, aliases,
 * priced tests and profiles) is loaded into the browser once — right when
 * the page opens, not on the first keystroke — and every keystroke is
 * searched locally (lib/search/catalog/search-catalog.ts), with the same
 * fuzzy matching as the server and no request per keystroke. Refreshed in
 * the background so price changes still come through.
 */
function useSearchCatalog(
  type: ServiceType,
  locationId: string,
  active: boolean,
  initialCatalogs: Record<string, SearchCatalog>
) {
  const key =
    locationId && active ? `/api/search/catalog?${new URLSearchParams({ locationId, serviceType: type })}` : null;
  // The page arrives with the current location's catalog already in it
  // (initialCatalogs), so the first search doesn't wait for a download.
  return useSWR<SearchCatalog>(key, fetcher, {
    refreshInterval: CATALOG_REFRESH_MS,
    keepPreviousData: false,
    fallbackData: key ? initialCatalogs[key] : undefined,
    revalidateOnMount: !(key && initialCatalogs[key]),
  });
}

/**
 * One service type's search results, computed in the browser from its
 * loaded catalog: the full A–Z list when browsing, otherwise the fuzzy
 * matches for `query`.
 */
function useCatalogGroup(
  type: ServiceType,
  catalogSwr: { data?: SearchCatalog; error?: unknown },
  { wanted, browsing, query, showProfiles }: { wanted: boolean; browsing: boolean; query: string; showProfiles: boolean }
): SearchResultGroup {
  const catalog = catalogSwr.data;
  const tests = useMemo(
    () => (!catalog || !wanted ? EMPTY_TEST_RESULTS : browsing ? catalog.priced : searchCatalogTests(query, catalog)),
    [catalog, wanted, browsing, query]
  );
  const profiles = useMemo(
    () =>
      !catalog || !wanted || !showProfiles
        ? EMPTY_PROFILE_RESULTS
        : browsing
          ? catalog.profiles
          : searchCatalogProfiles(query, catalog),
    [catalog, wanted, browsing, showProfiles, query]
  );
  const loading = wanted && !catalog && !catalogSwr.error;
  return {
    serviceType: type,
    tests,
    testsLoading: loading,
    testsError: catalogSwr.error instanceof Error ? catalogSwr.error.message : null,
    didYouMean: null,
    profiles,
    profilesLoading: loading && showProfiles,
  };
}

/** Calculated parameters matching `query` in a loaded catalog — none while browsing or with an empty box. */
function useCalculatedResults(
  catalog: SearchCatalog | undefined,
  { browsing, query }: { browsing: boolean; query: string }
): CalculatedSearchResult[] {
  return useMemo(
    () => (browsing || !query || !catalog ? EMPTY_CALCULATED_RESULTS : searchCatalogCalculated(query, catalog)),
    [catalog, browsing, query]
  );
}

/**
 * Everything behind the "Search tests" tab: the debounced query, the
 * in-browser catalog search per service type, calculated parameters,
 * exact-match narrowing, "Did you mean…?", the Gemini fallback when nothing
 * matches, and the missed-search telemetry for Admin > Missed searches.
 */
export function useWorkspaceSearch({
  query,
  locationId,
  serviceTypeFilter,
  enabled,
  initialCatalogs,
}: {
  query: string;
  locationId: string;
  serviceTypeFilter: ServiceTypeFilter;
  /** The search tab is open (the AI fallback and telemetry only run then). */
  enabled: boolean;
  initialCatalogs: Record<string, SearchCatalog>;
}) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    // Clearing is instant; typing waits for the short pause.
    const timeout = setTimeout(() => setDebouncedQuery(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const activeServiceTypes: readonly ServiceType[] =
    serviceTypeFilter === "all" ? SERVICE_TYPES : [serviceTypeFilter];
  const isActive = (type: ServiceType) => activeServiceTypes.includes(type);
  // An empty search box with In-House or Outsourced picked lists that
  // service type's full priced catalog (tests + profiles, A–Z).
  const browsing = !trimmedQuery && serviceTypeFilter !== "all";

  const inHouseCatalog = useSearchCatalog("in_house", locationId, isActive("in_house"), initialCatalogs);
  const outsourceCatalog = useSearchCatalog("outsource", locationId, isActive("outsource"), initialCatalogs);
  const catalogFor = (type: ServiceType) => (type === "in_house" ? inHouseCatalog : outsourceCatalog).data;
  // "All" lists in-house profiles only (see SearchResults).
  const profilesShown = (type: ServiceType) => (serviceTypeFilter === "all" ? type === "in_house" : isActive(type));
  const groupOptions = (type: ServiceType) => ({
    wanted: isActive(type) && (browsing || Boolean(trimmedQuery)),
    browsing,
    query: trimmedQuery,
    showProfiles: profilesShown(type),
  });
  const inHouseGroup = useCatalogGroup("in_house", inHouseCatalog, groupOptions("in_house"));
  const outsourceGroup = useCatalogGroup("outsource", outsourceCatalog, groupOptions("outsource"));

  // Calculated parameters matching the search, their source tests priced in
  // the first active service type (in-house before outsourced).
  const rawCalculated = useCalculatedResults(catalogFor(isActive("in_house") ? "in_house" : "outsource"), {
    browsing,
    query: trimmedQuery,
  });

  // "Did you mean …?" comes from the server's spelling helper — asked only
  // when the local search found nothing at all.
  const nothingFound =
    !browsing &&
    Boolean(trimmedQuery) &&
    [inHouseGroup, outsourceGroup].every(
      (group) => !group.testsLoading && group.tests.length === 0 && group.profiles.length === 0
    );
  const { data: correction } = useSWR<{ didYouMean?: string | null }>(
    nothingFound && locationId
      ? `/api/search?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: activeServiceTypes[0] })}`
      : null,
    fetcher,
    { shouldRetryOnError: false }
  );
  const didYouMean = nothingFound ? (correction?.didYouMean ?? null) : null;

  const groupDataByType: Record<ServiceType, SearchResultGroup> = {
    in_house: { ...inHouseGroup, didYouMean },
    outsource: { ...outsourceGroup, didYouMean },
  };
  // What the search shows: tests, profiles and packages. When something
  // matches exactly — a test's code/name, an alias typed in full, or a
  // profile's own name — only the exact match(es), not the lookalikes; with
  // no exact match, the closest names.
  const queryCompact = compact(trimmedQuery);
  const isExactTest = (result: SearchTestResult) =>
    result.matchType === "exact" || (result.matchedAlias !== null && compact(result.matchedAlias) === queryCompact);
  const isExactProfile = (result: ProfileSearchResult) => (result.nameScore ?? 0) >= EXACT_PROFILE_SCORE;
  const rawGroups = activeServiceTypes.map((type) => groupDataByType[type]);
  const exactMatch =
    !browsing &&
    (rawGroups.some((group) => group.tests.some(isExactTest) || group.profiles.some(isExactProfile)) ||
      rawCalculated.some((result) => result.exact));
  const fuzzyGroups = exactMatch
    ? rawGroups.map((group) => ({
        ...group,
        tests: group.tests.filter(isExactTest),
        profiles: group.profiles.filter(isExactProfile),
      }))
    : rawGroups;
  const fuzzyCalculated = exactMatch ? rawCalculated.filter((result) => result.exact) : rawCalculated;

  // Fuzzy search first; only when it finds nothing at all is Gemini asked
  // (/api/search/ai — tests and profiles only, priced from the DB).
  const fuzzyLoaded = fuzzyGroups.every((group) => !group.testsLoading && !group.profilesLoading);
  const fuzzyEmpty =
    fuzzyLoaded &&
    fuzzyCalculated.length === 0 &&
    fuzzyGroups.every((group) => group.tests.length === 0 && group.profiles.length === 0 && !group.testsError);
  const aiSearchKey =
    enabled && !browsing && trimmedQuery.length >= AI_SEARCH_MIN_LENGTH && locationId && fuzzyEmpty
      ? `/api/search/ai?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: serviceTypeFilter })}`
      : null;
  const { data: aiSearch, isLoading: aiSearchLoading } = useSWR<{
    tests: SearchTestResult[];
    profiles: ProfileSearchResult[];
  }>(aiSearchKey, fetcher, { shouldRetryOnError: false, revalidateOnFocus: false });
  const aiSearching = Boolean(aiSearchKey && aiSearchLoading);
  const aiFound = Boolean(aiSearchKey && aiSearch && aiSearch.tests.length + aiSearch.profiles.length > 0);
  const groups: SearchResultGroup[] = aiSearching
    ? fuzzyGroups.map((group) => ({ ...group, testsLoading: true }))
    : aiFound && aiSearch
      ? activeServiceTypes.map((type) => ({
          ...groupDataByType[type],
          tests: aiSearch.tests.filter((result) => result.serviceType === type),
          profiles: aiSearch.profiles.filter((result) => result.serviceType === type),
          didYouMean: null,
        }))
      : fuzzyGroups;

  // Missed-search log for the admin (use-search-telemetry.ts): what agents
  // pick, and what they search for and fail to find — judged on the fuzzy
  // search, so a search only the AI could answer still shows up as a miss
  // (worth an alias). "All" can list a test under both service types, so a
  // pick's rank counts each test once.
  const rankedTestIds = [...new Set(fuzzyGroups.flatMap((group) => group.tests.map((result) => result.testId)))];
  const ruleProfileCount = new Set(fuzzyGroups.flatMap((group) => group.profiles.map((result) => result.profileId)))
    .size;
  const telemetry = useSearchTelemetry({
    query: trimmedQuery,
    enabled,
    loaded: fuzzyLoaded,
    resultCount: rankedTestIds.length + ruleProfileCount,
    rankedTestIds,
    locationId: locationId || null,
  });

  /**
   * The tests and profiles for what's in the box right now. Enter pressed
   * straight after typing arrives before the shown results catch up (they
   * wait for a short pause), so a newer query is searched against the
   * loaded catalogs directly.
   */
  function resultsFor(typed: string) {
    if (typed === trimmedQuery) {
      return {
        tests: groups.flatMap((group) => group.tests),
        profiles: groups.flatMap((group) => group.profiles),
        stillSearching: groups.some((group) => group.testsLoading || group.profilesLoading),
      };
    }
    const catalogs = activeServiceTypes.flatMap((type) => catalogFor(type) ?? []);
    return {
      tests: catalogs.flatMap((catalog) => searchCatalogTests(typed, catalog)),
      profiles: catalogs.flatMap((catalog) => searchCatalogProfiles(typed, catalog)),
      stillSearching: false,
    };
  }

  // Every active catalog has loaded and none prices anything here — the
  // results say so instead of "no match" for every search.
  const activeCatalogs = activeServiceTypes.map(catalogFor);
  const catalogEmpty =
    activeCatalogs.every(Boolean) &&
    activeCatalogs.every((catalog) => catalog!.priced.length === 0 && catalog!.profiles.length === 0);

  return {
    debouncedQuery,
    browsing,
    catalogEmpty,
    groups,
    calculated: aiFound ? EMPTY_CALCULATED_RESULTS : fuzzyCalculated,
    exactMatch,
    aiFound,
    aiSearching,
    telemetry,
    resultsFor,
    isExactTest,
    isExactProfile,
  };
}
