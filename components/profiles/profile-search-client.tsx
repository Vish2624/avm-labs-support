"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { useQuote } from "@/components/workspace/quote/quote-provider";
import { ProfileSearch, type ProfileSearchMode } from "./profile-search";
import { ProfileResults } from "./profile-results";
import { fetcher } from "@/lib/utils/fetcher";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";
import type { ResolvedTestQuery } from "@/lib/search/catalog/resolve-test-ids";

const SEARCH_DEBOUNCE_MS = 300;

export function ProfileSearchClient() {
  // Location comes from the header's picker (shared with the Quote screen).
  const { locationId } = useQuote();
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [mode, setMode] = useState<ProfileSearchMode>("name");

  const [nameQuery, setNameQuery] = useState("");
  const [debouncedNameQuery, setDebouncedNameQuery] = useState("");
  const [testQueries, setTestQueries] = useState<string[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedNameQuery(nameQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [nameQuery]);

  // Resolve test-name chips to catalog test ids before ranking profiles.
  const resolveKey =
    testQueries.length > 0 ? `/api/tests/resolve?${new URLSearchParams({ names: testQueries.join(",") })}` : null;
  const { data: resolveData } = useSWR<{ results: ResolvedTestQuery[] }>(resolveKey, fetcher);
  const resolved = useMemo(() => resolveData?.results ?? [], [resolveData]);
  const resolvedByQuery = useMemo(() => new Map(resolved.map((entry) => [entry.query, entry])), [resolved]);
  const resolvedTestIds = useMemo(
    () => [...new Set(resolved.map((entry) => entry.test?.id).filter((id): id is string => Boolean(id)))],
    [resolved]
  );

  const trimmedNameQuery = debouncedNameQuery.trim();
  // Nothing typed yet: list every package here, A–Z, so there's something to browse.
  const browsing = mode === "name" && !trimmedNameQuery;
  const nameSearchKey =
    mode === "name" && locationId
      ? `/api/profiles?${new URLSearchParams(
          browsing ? { browse: "1", locationId, serviceType } : { q: trimmedNameQuery, locationId, serviceType }
        )}`
      : null;
  const testSearchKey =
    mode === "tests" && resolvedTestIds.length > 0 && locationId
      ? `/api/profiles?${new URLSearchParams({ testIds: resolvedTestIds.join(","), locationId, serviceType })}`
      : null;

  const {
    data: nameData,
    error: nameErrorObj,
    isLoading: nameLoading,
  } = useSWR<{ results: ProfileSearchResult[] }>(nameSearchKey, fetcher);
  const {
    data: testData,
    error: testErrorObj,
    isLoading: testLoading,
  } = useSWR<{ results: ProfileSuggestion[] }>(testSearchKey, fetcher);

  const hasQuery = mode === "name" ? true : testQueries.length > 0;
  const results = mode === "name" ? (nameData?.results ?? []) : (testData?.results ?? []);
  const loading = mode === "name" ? nameLoading : testLoading || (testQueries.length > 0 && resolveData === undefined);
  const errorObj = mode === "name" ? nameErrorObj : testErrorObj;
  const error = errorObj instanceof Error ? errorObj.message : null;
  const emptyMessage =
    mode === "name"
      ? browsing
        ? "No packages are priced at this location yet."
        : `No package matches “${trimmedNameQuery}”.`
      : resolvedTestIds.length === 0
        ? "None of the typed test names matched the catalog."
        : "No package covers any of the resolved tests.";

  return (
    <div className="mx-auto flex h-full max-w-[1000px] flex-col gap-5 overflow-y-auto px-7 py-7">
      <div className="flex flex-wrap items-end justify-between gap-4 avm-fade-up">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Packages</h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            Find a package by its name, or by the tests the customer asked for.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
        </div>
      </div>

      <ProfileSearch
        mode={mode}
        onModeChange={setMode}
        nameQuery={nameQuery}
        onNameQueryChange={setNameQuery}
        testQueries={testQueries}
        onTestQueriesChange={setTestQueries}
        resolvedByQuery={resolvedByQuery}
      />

      {browsing && !loading && results.length > 0 ? (
        <p className="-mb-2 px-1 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          All {results.length} packages &amp; profiles · A–Z
        </p>
      ) : null}
      <ProfileResults hasQuery={hasQuery} results={results} loading={loading} error={error} emptyMessage={emptyMessage} />
    </div>
  );
}
