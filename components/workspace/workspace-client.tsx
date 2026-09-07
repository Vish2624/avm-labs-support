"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { PageHeader } from "@/components/layout/page-header";
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
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
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

  // Enter in the search box adds the first result that isn't already in the
  // quote — lets an agent clear a customer's list without touching the mouse.
  function handleSearchSubmit() {
    const next = searchResults.find((result) => !addedTestIds.has(result.testId));
    if (next) handleAdd(next);
  }

  function handleClear() {
    setLineItems((prev) => {
      if (prev.length === 0) return prev;
      toast("Quotation cleared.");
      return [];
    });
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

  const currencyCode = selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? null;
  const context = selectedLocation
    ? `${selectedLocation.name} · ${SERVICE_TYPE_LABELS[serviceType]}${currencyCode ? ` · prices in ${currencyCode}` : ""}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 lg:p-8">
      <PageHeader title="Support Workspace" description={context ?? undefined}>
        <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
        <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <CustomerRequestInput />

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary">
                  <SearchIcon className="size-3.5" />
                </span>
                Search tests
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <TestSearch value={query} onChange={setQuery} onSubmit={handleSearchSubmit} />
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

        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          {lineItems.length === 0 ? (
            <EmptyWorkspace />
          ) : (
            <QuotationPanel
              quotation={quotation}
              whatsappMessage={whatsappMessage}
              context={context}
              onRemove={handleRemove}
              onClear={handleClear}
            />
          )}
        </div>
      </div>
    </div>
  );
}
