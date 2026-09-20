"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeFilterSelector } from "./service-type-filter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestSearch } from "./test-search";
import { SearchResults, type SearchResultGroup } from "./search-results";
import { MessageExtractor } from "./message-extractor";
import { QuotationPanel } from "./quotation-panel";
import { PackageSuggestions } from "./package-suggestions";
import { EmptyWorkspace } from "./empty-workspace";
import { fetcher } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_FILTER_LABELS,
  type ServiceType,
  type ServiceTypeFilter,
} from "@/lib/constants/service-types";
import { cn } from "@/lib/utils";
import type { Location } from "@/types/location";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion, ProfileSearchResult } from "@/types/profile";
import type { Quotation, QuotationLineItem } from "@/types/quotation";

const SEARCH_DEBOUNCE_MS = 300;
// Floors for the draggable column split — matches the columns' own min-w
// classes so the divider never drags a column below where its content
// (buttons, filters) would start wrapping badly.
const LEFT_COLUMN_MIN_PX = 360;
const RIGHT_COLUMN_MIN_PX = 330;
const SPLIT_STORAGE_KEY = "avm-workspace-split";
// Stable references so a missing SWR response doesn't create a new empty
// array every render — that would retrigger effects keyed on these values.
const EMPTY_PROFILE_SUGGESTIONS: ProfileSuggestion[] = [];
const EMPTY_TEST_RESULTS: SearchTestResult[] = [];
const EMPTY_PROFILE_RESULTS: ProfileSearchResult[] = [];

const tabTriggerClassName = cn(
  "rounded-full border border-border/70 bg-card px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground shadow-none transition-all",
  "hover:border-primary/50 hover:text-foreground",
  "data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
);

export function WorkspaceClient({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  // "All" searches both service types at once, grouped in the results —
  // it's a search-time filter only, not a property of the quote itself
  // (each line item already carries its own real ServiceType).
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>("all");
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Draggable split between "Find tests" and "Quotation" — remembered per
  // browser so an agent who prefers a wider search column doesn't have to
  // redrag it every session.
  const columnsRef = useRef<HTMLDivElement>(null);
  // Starts at the SSR-safe default; hydrated from localStorage in an effect
  // below (reading it during the initial render would mismatch the
  // server-rendered HTML, which has no access to it).
  const [leftColumnPercent, setLeftColumnPercent] = useState(50);
  const [isResizingColumns, setIsResizingColumns] = useState(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= 20 && saved <= 80) {
      // One-time hydration of a persisted preference from localStorage,
      // which isn't available during SSR — the mount-only setState here is
      // intentional, not a synchronization loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeftColumnPercent(saved);
    }
  }, []);

  useEffect(() => {
    if (!isResizingColumns) return;

    function handlePointerMove(event: PointerEvent) {
      const container = columnsRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const minPercent = (LEFT_COLUMN_MIN_PX / rect.width) * 100;
      const maxPercent = 100 - (RIGHT_COLUMN_MIN_PX / rect.width) * 100;
      const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
      setLeftColumnPercent(Math.min(Math.max(rawPercent, minPercent), maxPercent));
    }
    function handlePointerUp() {
      setIsResizingColumns(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingColumns]);

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(leftColumnPercent));
  }, [leftColumnPercent]);

  const selectedLocation = locations.find((location) => location.id === locationId) ?? null;
  const isFirstRun = useRef(true);

  // Debounce the search query.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  // A quote's line items carry prices in one location's currency — changing
  // location invalidates the in-progress quote rather than silently mixing
  // currencies. Changing the service-type *search filter* no longer clears
  // it: that's just what you're browsing, not what's already in the cart
  // (searching "All" can add both in-house and outsourced tests to one quote).
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setLineItems((prev) => {
      if (prev.length === 0) return prev;
      toast("Location changed — quotation cleared.");
      return [];
    });
  }, [locationId]);

  // "/" and Cmd/Ctrl+K jump to the search tab and focus the box, from
  // anywhere on the page — unless the agent is already typing somewhere.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && /INPUT|TEXTAREA/.test(target.tagName));
      const isSlash = event.key === "/" && !typing;
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isSlash || isCmdK) {
        event.preventDefault();
        setTab("search");
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Live search — conditional SWR key delays the request until there's a
  // query, per Next.js's client-side data-fetching guide. "All" fetches
  // both service types (tests + profiles, so 4 requests) and groups them;
  // a single filter only fetches that one type's 2 requests.
  const trimmedQuery = debouncedQuery.trim();
  const activeServiceTypes: readonly ServiceType[] =
    serviceTypeFilter === "all" ? SERVICE_TYPES : [serviceTypeFilter];
  const isActiveServiceType = (type: ServiceType) => activeServiceTypes.includes(type);

  function useTestSearchResults(type: ServiceType) {
    const key =
      trimmedQuery && locationId && isActiveServiceType(type)
        ? `/api/search?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: type })}`
        : null;
    return useSWR<{ results: SearchTestResult[] }>(key, fetcher);
  }
  function useProfileSearchResults(type: ServiceType) {
    const key =
      trimmedQuery && locationId && isActiveServiceType(type)
        ? `/api/profiles?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: type })}`
        : null;
    return useSWR<{ results: ProfileSearchResult[] }>(key, fetcher);
  }

  const inHouseTests = useTestSearchResults("in_house");
  const outsourceTests = useTestSearchResults("outsource");
  const inHouseProfiles = useProfileSearchResults("in_house");
  const outsourceProfiles = useProfileSearchResults("outsource");

  const groupDataByType: Record<ServiceType, SearchResultGroup> = {
    in_house: {
      serviceType: "in_house",
      tests: inHouseTests.data?.results ?? EMPTY_TEST_RESULTS,
      testsLoading: inHouseTests.isLoading,
      testsError: inHouseTests.error instanceof Error ? inHouseTests.error.message : null,
      profiles: inHouseProfiles.data?.results ?? EMPTY_PROFILE_RESULTS,
      profilesLoading: inHouseProfiles.isLoading,
    },
    outsource: {
      serviceType: "outsource",
      tests: outsourceTests.data?.results ?? EMPTY_TEST_RESULTS,
      testsLoading: outsourceTests.isLoading,
      testsError: outsourceTests.error instanceof Error ? outsourceTests.error.message : null,
      profiles: outsourceProfiles.data?.results ?? EMPTY_PROFILE_RESULTS,
      profilesLoading: outsourceProfiles.isLoading,
    },
  };
  const searchGroups = activeServiceTypes.map((type) => groupDataByType[type]);

  // Profile suggestions for the currently selected tests — only meaningful
  // when the cart's tests all share one real service type (a package has
  // one service type too, so there's no single sensible comparison once
  // the cart itself mixes in-house and outsourced tests).
  const selectedTestIds = useMemo(() => lineItems.map((item) => item.testId), [lineItems]);
  const lineItemServiceTypes = useMemo(() => new Set(lineItems.map((item) => item.serviceType)), [lineItems]);
  const uniformServiceType = lineItemServiceTypes.size === 1 ? [...lineItemServiceTypes][0] : null;
  const profileKey =
    selectedTestIds.length > 0 && locationId && uniformServiceType
      ? `/api/profiles?${new URLSearchParams({ testIds: selectedTestIds.join(","), locationId, serviceType: uniformServiceType })}`
      : null;
  const { data: profileData, isLoading: profileLoading } = useSWR<{ results: ProfileSuggestion[] }>(
    profileKey,
    fetcher
  );
  const profileSuggestions = profileData?.results ?? EMPTY_PROFILE_SUGGESTIONS;

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

  function handleAddMany(results: SearchTestResult[]) {
    if (results.length === 0) return;
    results.forEach(handleAdd);
    toast.success(`${results.length} test${results.length === 1 ? "" : "s"} added`);
  }

  function handleRemove(testId: string) {
    setLineItems((prev) => prev.filter((item) => item.testId !== testId));
  }

  // Enter in the search box adds the first result (across active service
  // types, in_house before outsource) that isn't already in the quote —
  // lets an agent clear a customer's list without touching the mouse.
  function handleSearchSubmit() {
    for (const group of searchGroups) {
      const next = group.tests.find((result) => !addedTestIds.has(result.testId));
      if (next) {
        handleAdd(next);
        return;
      }
    }
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
      lineItems,
      total: sumMoney(
        lineItems.map((item) => item.price),
        selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? "AED"
      ),
    }),
    [locationId, lineItems, selectedLocation]
  );

  const whatsappMessage = useMemo(() => generateWhatsAppResponse(quotation), [quotation]);

  const currencyCode = selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? null;
  const context = selectedLocation
    ? `${selectedLocation.name} · ${SERVICE_TYPE_FILTER_LABELS[serviceTypeFilter]}${currencyCode ? ` · prices in ${currencyCode}` : ""}`
    : null;

  return (
    <div ref={columnsRef} className="flex h-full items-stretch overflow-hidden">
      <section
        style={{ width: `${leftColumnPercent}%` }}
        className="flex h-full min-w-[360px] flex-none flex-col overflow-hidden border-r border-border"
      >
        {/* Static: header, tabs, and (on the search tab) the search box itself
            never scroll — only the results below them do. */}
        <div className="flex shrink-0 flex-col gap-4 border-b border-border px-6 pt-5 pb-4 lg:px-7 lg:pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">Find tests</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{context}</p>
            </div>
            <div className="flex items-center gap-2">
              <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
              <ServiceTypeFilterSelector value={serviceTypeFilter} onChange={setServiceTypeFilter} />
            </div>
          </div>

          <Tabs value={tab} onValueChange={(next) => setTab(next as "search" | "paste")}>
            <TabsList className="h-auto gap-1.5 rounded-none bg-transparent p-0">
              <TabsTrigger value="search" className={tabTriggerClassName}>
                Search tests
              </TabsTrigger>
              <TabsTrigger value="paste" className={tabTriggerClassName}>
                Paste a message
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "search" ? (
            <div className="flex flex-col gap-2">
              <TestSearch value={query} onChange={setQuery} onSubmit={handleSearchSubmit} inputRef={searchInputRef} />
              {!query.trim() ? (
                <p className="pl-1 text-[13px] text-muted-foreground">
                  Press <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">/</kbd> anywhere to
                  jump here. Nicknames work too — try &ldquo;sugar test&rdquo;.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Scrollable: results only. */}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 pt-3 pb-5 lg:px-7 lg:pb-6">
          {tab === "search" ? (
            <SearchResults
              query={debouncedQuery}
              groups={searchGroups}
              showGroupHeaders={serviceTypeFilter === "all"}
              addedTestIds={addedTestIds}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          ) : (
            <MessageExtractor
              locationId={locationId}
              // The pasted-message extractor resolves each token through a
              // single /api/search call — "All" has no one service type to
              // pass, so this falls back to in_house rather than doubling
              // every extraction into 2N requests for a rarely-mixed case.
              serviceType={serviceTypeFilter === "all" ? SERVICE_TYPES[0] : serviceTypeFilter}
              addedTestIds={addedTestIds}
              onAddMany={handleAddMany}
            />
          )}

          <PackageSuggestions
            suggestions={profileSuggestions}
            loading={profileLoading}
            hasSelection={lineItems.length > 0}
            lineItems={lineItems}
          />
        </div>
      </section>

      {/* Drag to resize the two columns; double-click resets to a 50/50 split. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize columns"
        onPointerDown={(event) => {
          event.preventDefault();
          setIsResizingColumns(true);
        }}
        onDoubleClick={() => setLeftColumnPercent(50)}
        className="group relative w-2.5 shrink-0 cursor-col-resize touch-none"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
            "group-hover:bg-primary/50",
            isResizingColumns && "bg-primary"
          )}
        />
      </div>

      <div className="min-w-[330px] flex-1 overflow-hidden">
        <section className="flex h-full flex-col overflow-hidden bg-card">
          {lineItems.length === 0 ? (
            <div className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-5 lg:px-7 lg:py-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Quotation</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">Nothing added yet</p>
              </div>
              <EmptyWorkspace />
            </div>
          ) : (
            <QuotationPanel
              quotation={quotation}
              whatsappMessage={whatsappMessage}
              context={context}
              onRemove={handleRemove}
              onClear={handleClear}
            />
          )}
        </section>
      </div>
    </div>
  );
}
