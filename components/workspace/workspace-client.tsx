"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowDownIcon } from "lucide-react";
import { LocationSelector } from "@/components/layout/location-selector";
import { ServiceTypeSelector } from "@/components/layout/service-type-selector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TestSearch } from "./test-search";
import { SearchResults } from "./search-results";
import { MessageExtractor } from "./message-extractor";
import { QuotationPanel } from "./quotation-panel";
import { EmptyWorkspace } from "./empty-workspace";
import { fetcher } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/constants/service-types";
import { cn } from "@/lib/utils";
import type { Location } from "@/types/location";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion } from "@/types/profile";
import type { Quotation, QuotationLineItem } from "@/types/quotation";

const SEARCH_DEBOUNCE_MS = 300;
// Stable reference so a missing SWR response doesn't create a new empty
// array every render — that would retrigger effects keyed on this value.
const EMPTY_PROFILE_SUGGESTIONS: ProfileSuggestion[] = [];

const tabTriggerClassName = cn(
  "rounded-full border border-border/70 bg-card px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground shadow-none transition-all",
  "hover:border-primary/50 hover:text-foreground",
  "data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
);

export function WorkspaceClient({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quotationScrollRef = useRef<HTMLElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

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

  // Show a floating "jump to bottom" button on the quotation column whenever
  // there's more content below the fold (the WhatsApp reply, usually) — lets
  // an agent skip past the package suggestions to copy the reply quickly.
  useEffect(() => {
    const panel = quotationScrollRef.current;
    if (!panel) return;

    function updateVisibility() {
      if (!panel) return;
      const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
      setShowJumpToBottom(distanceFromBottom > 48);
    }

    updateVisibility();
    panel.addEventListener("scroll", updateVisibility);
    const resizeObserver = new ResizeObserver(updateVisibility);
    resizeObserver.observe(panel);
    return () => {
      panel.removeEventListener("scroll", updateVisibility);
      resizeObserver.disconnect();
    };
  }, [lineItems, profileSuggestions, whatsappMessage]);

  function scrollQuotationToBottom() {
    quotationScrollRef.current?.scrollTo({ top: quotationScrollRef.current.scrollHeight, behavior: "smooth" });
  }

  const currencyCode = selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? null;
  const context = selectedLocation
    ? `${selectedLocation.name} · ${SERVICE_TYPE_LABELS[serviceType]}${currencyCode ? ` · prices in ${currencyCode}` : ""}`
    : null;

  return (
    <div className="flex h-full items-stretch overflow-hidden">
      <section className="flex h-full min-w-[360px] flex-1 flex-col gap-4 overflow-y-auto border-r border-border px-6 py-5 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Find tests</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{context}</p>
          </div>
          <div className="flex items-center gap-2">
            <LocationSelector locations={locations} value={locationId} onChange={setLocationId} />
            <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
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

          <TabsContent value="search" className="mt-4 flex flex-col gap-2">
            <TestSearch value={query} onChange={setQuery} onSubmit={handleSearchSubmit} inputRef={searchInputRef} />
            {!query.trim() ? (
              <p className="pl-1 text-[13px] text-muted-foreground">
                Press <kbd className="rounded border bg-muted px-1 font-mono text-[0.7rem]">/</kbd> anywhere to jump
                here. Nicknames work too — try &ldquo;sugar test&rdquo;.
              </p>
            ) : null}
            <SearchResults
              query={debouncedQuery}
              results={searchResults}
              loading={searchLoading}
              error={searchError}
              addedTestIds={addedTestIds}
              onAdd={handleAdd}
            />
          </TabsContent>

          <TabsContent value="paste" className="mt-4">
            <MessageExtractor
              locationId={locationId}
              serviceType={serviceType}
              addedTestIds={addedTestIds}
              onAddMany={handleAddMany}
            />
          </TabsContent>
        </Tabs>
      </section>

      <div className="relative min-w-[330px] flex-1">
        <section
          ref={quotationScrollRef}
          className="flex h-full flex-col gap-5 overflow-y-auto bg-card px-6 py-5 lg:px-7 lg:py-6"
        >
          {lineItems.length === 0 ? (
            <>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Quotation</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">Nothing added yet</p>
              </div>
              <EmptyWorkspace />
            </>
          ) : (
            <QuotationPanel
              quotation={quotation}
              whatsappMessage={whatsappMessage}
              context={context}
              profileSuggestions={profileSuggestions}
              profileSuggestionsLoading={profileLoading}
              onRemove={handleRemove}
              onClear={handleClear}
            />
          )}
        </section>

        {showJumpToBottom ? (
          <Button
            type="button"
            size="icon-lg"
            onClick={scrollQuotationToBottom}
            aria-label="Jump to the WhatsApp reply"
            title="Jump to the WhatsApp reply"
            className="absolute bottom-5 right-5 shadow-lg animate-in fade-in zoom-in-95"
          >
            <ArrowDownIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
