"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ServiceTypeFilterSelector } from "./service-type-filter";
import { TestSearch } from "./test-search";
import { SearchResults, type SearchResultGroup } from "./search-results";
import { MessageExtractionResults, useMessageExtraction } from "./message-extractor";
import { QuotationPanel } from "./quotation-panel";
import { PackageSuggestions } from "./package-suggestions";
import { useQuote } from "./quote-provider";
import { fetcher, postJson } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { applyDiscount } from "@/lib/pricing/discount";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import { SERVICE_TYPES, type ServiceType, type ServiceTypeFilter } from "@/lib/constants/service-types";
import { cn } from "@/lib/utils";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion, ProfileSearchResult } from "@/types/profile";
import type {
  Quotation,
  QuotationLineItem,
  QuotationPackageLine,
  QuotationTestLine,
} from "@/types/quotation";
import type { QuoteHistoryInput } from "@/types/quote-history";

const SEARCH_DEBOUNCE_MS = 300;
// Floors for the draggable column split — matches the columns' own min-w
// classes so the divider never drags a column below where its content
// (buttons, filters) would start wrapping badly.
const LEFT_COLUMN_MIN_PX = 380;
const RIGHT_COLUMN_MIN_PX = 340;
const SPLIT_STORAGE_KEY = "avm-workspace-split-v2";
// The redesign's 1.25 : 1 split between "Find tests" and "Quotation".
const DEFAULT_LEFT_PERCENT = 55.5;
// Stable references so a missing SWR response doesn't create a new empty
// array every render — that would retrigger effects keyed on these values.
const EMPTY_PROFILE_SUGGESTIONS: ProfileSuggestion[] = [];
const EMPTY_TEST_RESULTS: SearchTestResult[] = [];
const EMPTY_PROFILE_RESULTS: ProfileSearchResult[] = [];

function toTestLine(result: SearchTestResult): QuotationTestLine {
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

function toPackageLine(result: ProfileSearchResult | ProfileSuggestion): QuotationPackageLine {
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

function toHistoryInput(quotation: Quotation, replyText: string): QuoteHistoryInput {
  const { tier, discountedTotal } = applyDiscount(quotation.total);
  return {
    locationId: quotation.locationId,
    customerName: quotation.customerName?.trim() || null,
    lineItems: quotation.lineItems.map((item) => ({
      kind: item.kind,
      refId: item.kind === "test" ? item.testId : item.profileId,
      code: item.code,
      name: item.name,
      serviceType: item.serviceType,
      price: item.price,
    })),
    subtotal: quotation.total,
    discountPercent: tier?.percent ?? 0,
    total: discountedTotal,
    replyText,
  };
}

const segmentClassName = (active: boolean) =>
  cn(
    "h-[30px] rounded-lg px-3.5 text-[13px] font-medium transition-colors",
    active ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.02_258/0.12)]" : "text-muted-foreground hover:text-foreground"
  );

export function WorkspaceClient() {
  const {
    locationId,
    selectedLocation,
    lineItems,
    addLineItem,
    addLineItems,
    removeLineItem,
    applyPackage,
    clear,
    customerName,
    setCustomerName,
  } = useQuote();

  // "All" searches both service types at once, grouped in the results —
  // it's a search-time filter only, not a property of the quote itself
  // (each line item already carries its own real ServiceType).
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>("all");
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pasteText, setPasteText] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Draggable split between "Find tests" and "Quotation" — remembered per
  // browser so an agent who prefers a wider search column doesn't have to
  // redrag it every session.
  const columnsRef = useRef<HTMLDivElement>(null);
  // Starts at the SSR-safe default; hydrated from localStorage in an effect
  // below (reading it during the initial render would mismatch the
  // server-rendered HTML, which has no access to it).
  const [leftColumnPercent, setLeftColumnPercent] = useState(DEFAULT_LEFT_PERCENT);
  const [isResizingColumns, setIsResizingColumns] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= 20 && saved <= 80) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a persisted preference
        setLeftColumnPercent(saved);
      }
    } catch {
      // Storage blocked — keep the default split.
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
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(leftColumnPercent));
    } catch {
      // Storage blocked — the split just won't be remembered.
    }
  }, [leftColumnPercent]);

  // Debounce the search query.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  // "/" and Cmd/Ctrl+K jump to the search tab and focus the box, from
  // anywhere on the page — unless the agent is already typing somewhere.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && /INPUT|TEXTAREA|SELECT/.test(target.tagName));
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
  // query. "All" fetches both service types (tests + packages, so 4
  // requests) and groups them; a single filter only fetches that type's 2.
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

  // The pasted-message reader resolves each token through a single
  // /api/search call — "All" has no one service type to pass, so this falls
  // back to in_house rather than doubling every extraction into 2N requests
  // for a rarely-mixed case.
  const extraction = useMessageExtraction(
    tab === "paste" ? pasteText : "",
    locationId,
    serviceTypeFilter === "all" ? SERVICE_TYPES[0] : serviceTypeFilter
  );

  const testLines = useMemo(
    () => lineItems.filter((item): item is QuotationTestLine => item.kind === "test"),
    [lineItems]
  );

  // Package suggestions for the tests on the quote — only meaningful when
  // those tests share one real service type (a package has one service
  // type too, so there's no single sensible comparison once the tests
  // themselves mix in-house and outsourced).
  const selectedTestIds = useMemo(() => testLines.map((item) => item.testId), [testLines]);
  const testServiceTypes = useMemo(() => new Set(testLines.map((item) => item.serviceType)), [testLines]);
  const uniformServiceType = testServiceTypes.size === 1 ? [...testServiceTypes][0] : null;
  const profileKey =
    selectedTestIds.length > 0 && locationId && uniformServiceType
      ? `/api/profiles?${new URLSearchParams({ testIds: selectedTestIds.join(","), locationId, serviceType: uniformServiceType })}`
      : null;
  const { data: profileData, isLoading: profileLoading } = useSWR<{ results: ProfileSuggestion[] }>(
    profileKey,
    fetcher
  );
  const addedProfileIds = useMemo(
    () => new Set(lineItems.flatMap((item) => (item.kind === "package" ? [item.profileId] : []))),
    [lineItems]
  );
  // A package that's already on the quote isn't worth suggesting again.
  const profileSuggestions = useMemo(
    () =>
      (profileData?.results ?? EMPTY_PROFILE_SUGGESTIONS).filter(
        (suggestion) => !addedProfileIds.has(suggestion.profileId)
      ),
    [profileData, addedProfileIds]
  );

  const addedTestIds = useMemo(() => new Set(selectedTestIds), [selectedTestIds]);

  function handleAdd(result: SearchTestResult) {
    addLineItem(toTestLine(result));
  }

  function handleAddMany(results: SearchTestResult[]) {
    if (results.length === 0) return;
    addLineItems(results.map(toTestLine));
    toast.success(`${results.length} test${results.length === 1 ? "" : "s"} added`);
  }

  function handleRemoveTest(testId: string) {
    removeLineItem({ kind: "test", testId });
  }

  function handleRemove(item: QuotationLineItem) {
    removeLineItem(item.kind === "test" ? { kind: "test", testId: item.testId } : { kind: "package", profileId: item.profileId });
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

  const quotation: Quotation = useMemo(
    () => ({
      locationId,
      lineItems,
      customerName,
      total: sumMoney(
        lineItems.map((item) => item.price),
        selectedLocation?.currencyCode ?? lineItems[0]?.price.currency ?? "AED"
      ),
    }),
    [locationId, lineItems, customerName, selectedLocation]
  );

  const whatsappMessage = useMemo(() => generateWhatsAppResponse(quotation), [quotation]);

  async function handleCopy(message: string) {
    await postJson("/api/quotes", toHistoryInput(quotation, message));
  }

  const locationLabel = selectedLocation
    ? `${selectedLocation.name} · prices in ${selectedLocation.currencyCode}`
    : null;

  return (
    <div ref={columnsRef} className="flex h-full items-stretch overflow-hidden">
      <section
        style={{ width: `${leftColumnPercent}%` }}
        className="flex h-full min-w-[380px] flex-none flex-col overflow-hidden"
      >
        {/* Static: mode tabs, filters and the search/paste box never scroll —
            only the results below them do. */}
        <div className="flex shrink-0 flex-col gap-3.5 border-b border-border px-7 pt-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
              <button type="button" onClick={() => setTab("search")} className={segmentClassName(tab === "search")}>
                Search tests
              </button>
              <button type="button" onClick={() => setTab("paste")} className={segmentClassName(tab === "paste")}>
                Paste a message
              </button>
            </div>
            <ServiceTypeFilterSelector value={serviceTypeFilter} onChange={setServiceTypeFilter} />
          </div>

          {tab === "search" ? (
            <TestSearch value={query} onChange={setQuery} onSubmit={handleSearchSubmit} inputRef={searchInputRef} />
          ) : (
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="Paste the customer's message, e.g. “Hi, how much for vit d, b12 and a sugar test?”"
              aria-label="Customer message"
              autoFocus
              className="h-24 w-full resize-y rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/12"
            />
          )}
        </div>

        {/* Scrollable: results only. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
          {tab === "search" ? (
            <SearchResults
              query={debouncedQuery}
              locationName={selectedLocation?.name ?? null}
              groups={searchGroups}
              showGroupHeaders={serviceTypeFilter === "all"}
              addedTestIds={addedTestIds}
              addedProfileIds={addedProfileIds}
              onAdd={handleAdd}
              onRemove={handleRemoveTest}
              onAddPackage={(result) => applyPackage(toPackageLine(result))}
              onRemovePackage={(profileId) => removeLineItem({ kind: "package", profileId })}
            />
          ) : (
            <MessageExtractionResults
              text={pasteText}
              detected={extraction.detected}
              loading={extraction.loading}
              addedTestIds={addedTestIds}
              onAdd={handleAdd}
              onRemove={handleRemoveTest}
              onAddMany={handleAddMany}
            />
          )}
        </div>

        <PackageSuggestions
          suggestions={profileSuggestions}
          loading={profileLoading}
          hasSelection={testLines.length > 0}
          lineItems={lineItems}
          locationName={selectedLocation?.name ?? null}
          onUse={(suggestion) => applyPackage(toPackageLine(suggestion))}
        />
      </section>

      {/* Drag to resize the two columns; double-click resets the split. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize columns"
        onPointerDown={(event) => {
          event.preventDefault();
          setIsResizingColumns(true);
        }}
        onDoubleClick={() => setLeftColumnPercent(DEFAULT_LEFT_PERCENT)}
        className="group relative w-0 shrink-0 cursor-col-resize touch-none"
      >
        <div
          className={cn(
            "absolute inset-y-0 -left-1 w-2.5",
            "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-colors",
            "group-hover:after:bg-primary/50",
            isResizingColumns && "after:bg-primary"
          )}
        />
      </div>

      <aside className="h-full min-w-[340px] flex-1 overflow-hidden bg-card">
        <QuotationPanel
          quotation={quotation}
          whatsappMessage={whatsappMessage}
          locationLabel={locationLabel}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          onRemove={handleRemove}
          onClear={clear}
          onCopy={handleCopy}
        />
      </aside>
    </div>
  );
}
