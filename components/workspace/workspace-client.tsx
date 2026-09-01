"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { CustomerRequestInput } from "./customer-request-input";
import { TestSearch } from "./test-search";
import { SearchResults } from "./search-results";
import { QuotationPanel } from "./quotation-panel";
import { ProfileSuggestions } from "./profile-suggestions";
import { EmptyWorkspace } from "./empty-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetcher } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion } from "@/types/profile";
import type { Quotation, QuotationLineItem } from "@/types/quotation";

const SEARCH_DEBOUNCE_MS = 300;

export function WorkspaceClient({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);

  const selectedLocation = locations.find((location) => location.id === locationId) ?? null;
  const isFirstRun = useRef(true);

  // Debounce the search query.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  // A quote's line items carry prices in one location's currency at one
  // service type — switching either invalidates the in-progress quote
  // rather than silently mixing currencies/prices.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setLineItems((prev) => {
      if (prev.length === 0) return prev;
      toast("Location or service type changed — quotation cleared.");
      return [];
    });
  }, [locationId, serviceType]);

  // Live search — conditional SWR key delays the request until there's a
  // query, per Next.js's client-side data-fetching guide.
  const trimmedQuery = debouncedQuery.trim();
  const searchKey =
    trimmedQuery && locationId
      ? `/api/search?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType })}`
      : null;
  const {
    data: searchData,
    error: searchErrorObj,
    isLoading: searchLoading,
  } = useSWR<{ results: SearchTestResult[] }>(searchKey, fetcher);
  const searchResults = searchData?.results ?? [];
  const searchError = searchErrorObj instanceof Error ? searchErrorObj.message : null;

  // Profile suggestions for the currently selected tests.
  const selectedTestIds = useMemo(() => lineItems.map((item) => item.testId), [lineItems]);
  const profileKey =
    selectedTestIds.length > 0 && locationId
      ? `/api/profiles?${new URLSearchParams({ testIds: selectedTestIds.join(","), locationId, serviceType })}`
      : null;
  const { data: profileData, isLoading: profileLoading } = useSWR<{ results: ProfileSuggestion[] }>(
    profileKey,
    fetcher
  );
  const profileSuggestions = profileData?.results ?? [];

  const addedTestIds = useMemo(() => new Set(lineItems.map((item) => item.testId)), [lineItems]);

  function handleAdd(result: SearchTestResult) {
    setLineItems((prev) => {
      if (prev.some((item) => item.testId === result.testId)) return prev;
      const newItem: QuotationLineItem = {
        testId: result.testId,
        testCode: result.code,
        testName: result.officialName,
        price: result.price,
        tatText: result.tatText,
        serviceType: result.serviceType,
        availability: result.availability,
      };
      return [...prev, newItem];
    });
  }

  function handleRemove(testId: string) {
    setLineItems((prev) => prev.filter((item) => item.testId !== testId));
  }

  const quotation: Quotation = useMemo(
    () => ({
      locationId,
      serviceType,
      lineItems,
      total: sumMoney(
        lineItems.map((item) => item.price),
        selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? "AED"
      ),
    }),
    [locationId, serviceType, lineItems, selectedLocation]
  );

  const whatsappMessage = useMemo(() => generateWhatsAppResponse(quotation), [quotation]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Support Workspace</h1>
        <div className="flex items-center gap-2">
          <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
          <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <CustomerRequestInput />

          <Card>
            <CardHeader>
              <CardTitle>Search tests</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <TestSearch value={query} onChange={setQuery} />
              <SearchResults
                query={debouncedQuery}
                results={searchResults}
                loading={searchLoading}
                error={searchError}
                addedTestIds={addedTestIds}
                onAdd={handleAdd}
              />
            </CardContent>
          </Card>

          <ProfileSuggestions
            suggestions={profileSuggestions}
            loading={profileLoading}
            hasSelection={selectedTestIds.length > 0}
          />
        </div>

        <div className="flex flex-col gap-4">
          {lineItems.length === 0 ? (
            <EmptyWorkspace />
          ) : (
            <QuotationPanel quotation={quotation} whatsappMessage={whatsappMessage} onRemove={handleRemove} />
          )}
        </div>
      </div>
    </div>
  );
}
