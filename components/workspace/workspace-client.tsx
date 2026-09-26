"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
import { ServiceTypeFilterSelector } from "./service-type-filter";
import { TestSearch } from "./test-search";
import { SearchResults, type SearchResultGroup } from "./search-results";
import { useSemanticMessageMatches, useSemanticSearch } from "./use-semantic-search";
import { MessageExtractionResults, useMessageExtraction } from "./message-extractor";
import { QuotationPanel } from "./quotation-panel";
import { PackageSuggestions } from "./package-suggestions";
import { AiAssistantResults, AiQuestionForm, useAiAssistant } from "./ai-test-assistant";
import { useQuote } from "./quote-provider";
import { fetcher } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import { SERVICE_TYPES, type ServiceType, type ServiceTypeFilter } from "@/lib/constants/service-types";
import { isTestList } from "@/lib/search/split-test-list";
import { cn } from "@/lib/utils";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion, ProfileSearchResult } from "@/types/profile";
import type {
  Quotation,
  QuotationLineItem,
  QuotationPackageLine,
  QuotationTestLine,
} from "@/types/quotation";

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
const EMPTY_TOKENS: string[] = [];

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

const segmentClassName = (active: boolean) =>
  cn(
    // The white "card" behind the active tab is a separate sliding element.
    "relative h-[34px] rounded-[9px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-250",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
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
  const [tab, setTab] = useState<"search" | "paste" | "ai">("search");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pasteText, setPasteText] = useState("");
  // A pasted message is only read when the agent asks for it (Find tests
  // button / Ctrl+Enter), not on every keystroke while they paste or edit.
  const [submittedPasteText, setSubmittedPasteText] = useState("");
  function submitPaste() {
    setSubmittedPasteText(pasteText.trim());
  }
  const searchInputRef = useRef<HTMLInputElement>(null);
  // AI Test Assistant: its own question box and results, separate from the
  // search box and the pasted-message reader.
  const [aiQuestion, setAiQuestion] = useState("");

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
      trimmedQuery && !isTestList(trimmedQuery) && locationId && isActiveServiceType(type)
        ? `/api/search?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: type })}`
        : null;
    return useSWR<{ results: SearchTestResult[]; isList?: boolean; didYouMean?: string | null }>(key, fetcher);
  }
  function useProfileSearchResults(type: ServiceType) {
    // "All" lists in-house packages only (see SearchResults), so outsourced
    // packages are only fetched when that filter is picked on its own.
    const shown = serviceTypeFilter === "all" ? type === "in_house" : isActiveServiceType(type);
    const key =
      trimmedQuery && !isTestList(trimmedQuery) && locationId && shown
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
      didYouMean: inHouseTests.data?.didYouMean ?? null,
      profiles: inHouseProfiles.data?.results ?? EMPTY_PROFILE_RESULTS,
      profilesLoading: inHouseProfiles.isLoading,
    },
    outsource: {
      serviceType: "outsource",
      tests: outsourceTests.data?.results ?? EMPTY_TEST_RESULTS,
      testsLoading: outsourceTests.isLoading,
      testsError: outsourceTests.error instanceof Error ? outsourceTests.error.message : null,
      didYouMean: outsourceTests.data?.didYouMean ?? null,
      profiles: outsourceProfiles.data?.results ?? EMPTY_PROFILE_RESULTS,
      profilesLoading: outsourceProfiles.isLoading,
    },
  };
  const searchGroups = activeServiceTypes.map((type) => groupDataByType[type]);

  // Free in-browser AI fallback (use-semantic-search.ts): only once the fast
  // rule-based results are in and none of them is a strong hit (an exact test, an alias typed in full, or a
  // package whose own name matches) — so common searches never wait on it.
  const ruleResultsLoaded = searchGroups.every((group) => !group.testsLoading && !group.profilesLoading);
  const queryCompact = trimmedQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
  const strongRuleHit = searchGroups.some(
    (group) =>
      group.tests.some(
        (result) =>
          result.matchType === "exact" ||
          (result.matchedAlias !== null && result.matchedAlias.toLowerCase().replace(/[^a-z0-9]/g, "") === queryCompact)
      ) || group.profiles.some((result) => (result.nameScore ?? 0) >= 90)
  );
  const semanticEnabled =
    tab === "search" &&
    trimmedQuery.length >= 3 &&
    !isTestList(trimmedQuery) &&
    !inHouseTests.data?.isList &&
    !outsourceTests.data?.isList &&
    Boolean(locationId) &&
    ruleResultsLoaded &&
    !strongRuleHit;
  const aiState = useSemanticSearch(trimmedQuery, semanticEnabled, locationId, serviceTypeFilter);

  // A search-box query holding several tests ("ACCP, ALKP, AMYL, ...") is
  // read like a pasted message — every test in it, not one fuzzy match for
  // the whole string. "All" prefers each test's in-house price and falls
  // back to outsourced.
  // Tests separated only by spaces ("TSH T3 T4") have no separator to spot
  // here, so the search API says when the query names several tests.
  const serverSaysList = Boolean(inHouseTests.data?.isList || outsourceTests.data?.isList);
  const searchIsList = tab === "search" && (isTestList(trimmedQuery) || serverSaysList);
  const extraction = useMessageExtraction(
    tab === "paste" ? submittedPasteText : searchIsList ? trimmedQuery : "",
    locationId,
    serviceTypeFilter
  );

  // Same free AI for pasted messages: names the reader couldn't recognise.
  const messageAi = useSemanticMessageMatches(
    extraction.loading ? EMPTY_TOKENS : extraction.unmatched,
    locationId,
    serviceTypeFilter
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
  const aiAssistant = useAiAssistant(locationId, serviceTypeFilter);



  function handleAdd(result: SearchTestResult) {
    addLineItem(toTestLine(result));
    // Still added (the agent may be quoting ahead), but flagged right away.
    if (result.availability !== "available") {
      toast.warning(`${result.code} is ${AVAILABILITY_LABELS[result.availability].toLowerCase()}`, {
        description: "Added — the quotation flags it before you send.",
      });
    }
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
    if (searchIsList) {
      handleAddMany(
        extraction.detected.filter((result) => result.availability === "available" && !addedTestIds.has(result.testId))
      );
      return;
    }
    for (const group of searchGroups) {
      const next = group.tests.find((result) => !addedTestIds.has(result.testId));
      if (next) {
        handleAdd(next);
        toast.success(`Added ${next.code}`);
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

  const locationLabel = selectedLocation
    ? `${selectedLocation.name} · prices in ${selectedLocation.currencyCode}`
    : null;

  return (
    <div ref={columnsRef} className="flex h-full items-stretch overflow-hidden avm-fade-up [animation-duration:.45s]">
      <section
        style={{ width: `${leftColumnPercent}%` }}
        className="flex h-full min-w-[380px] flex-none flex-col overflow-hidden"
      >
        {/* Static: mode tabs, filters and the search/paste box never scroll —
            only the results below them do. */}
        <div
          className="flex shrink-0 flex-col gap-4 border-b border-border px-7 pt-[22px] pb-[18px] avm-fade-up"
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Two equal segments with a card that slides under the active one
                  (hidden while the separate AI assistant is open). */}
              <div className="relative grid grid-cols-2 rounded-xl bg-muted p-1">
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-[transform,translate,scale,rotate,opacity] duration-400 ease-[cubic-bezier(.34,1.3,.64,1)]",
                    tab === "paste" && "translate-x-full",
                    tab === "ai" && "opacity-0"
                  )}
                />
                <button type="button" onClick={() => setTab("search")} className={segmentClassName(tab === "search")}>
                  Search tests
                </button>
                <button type="button" onClick={() => setTab("paste")} className={segmentClassName(tab === "paste")}>
                  Paste a message
                </button>
              </div>
              {/* Kept apart from the search/paste switch: a separate module,
                  not another way of searching. */}
              <button
                type="button"
                onClick={() => setTab("ai")}
                aria-pressed={tab === "ai"}
                className={cn(
                  "flex h-[42px] items-center gap-2 rounded-xl border px-4 text-sm font-medium whitespace-nowrap transition-[transform,translate,scale,rotate,box-shadow,background] duration-250 hover:-translate-y-px",
                  tab === "ai"
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]"
                    : "border-border text-primary avm-shimmer-bg hover:shadow-[0_8px_20px_-10px_var(--primary)]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2.5 rotate-45 rounded-[2px]", tab === "ai" ? "bg-primary-foreground" : "bg-primary")}
                />
                AI Test Assistant
              </button>
            </div>
            <ServiceTypeFilterSelector value={serviceTypeFilter} onChange={setServiceTypeFilter} />
          </div>

          {tab === "search" ? (
            <div key="search" className="avm-fade-up [animation-duration:.35s]">
              <TestSearch value={query} onChange={setQuery} onSubmit={handleSearchSubmit} inputRef={searchInputRef} />
            </div>
          ) : tab === "ai" ? (
            <div key="ai" className="avm-fade-up [animation-duration:.35s]">
            <AiQuestionForm
              value={aiQuestion}
              onChange={setAiQuestion}
              onSubmit={() => aiAssistant.ask(aiQuestion)}
              loading={aiAssistant.loading}
            />
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPaste();
              }}
              key="paste"
              className="flex flex-col gap-2.5 avm-fade-up [animation-duration:.35s]"
            >
              <textarea
                value={pasteText}
                onChange={(event) => {
                  setPasteText(event.target.value);
                  if (!event.target.value.trim()) setSubmittedPasteText("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    submitPaste();
                  }
                }}
                placeholder="Paste the customer's message, e.g. “Hi, how much for vit d, b12 and a sugar test?”"
                aria-label="Customer message"
                autoFocus
                className="min-h-28 w-full resize-y rounded-[14px] border border-input bg-card px-4 py-3.5 text-[14.5px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <div className="flex items-center justify-end gap-3">
                <span className="text-xs text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">Ctrl</kbd> +{" "}
                  <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">Enter</kbd>
                </span>
                <button
                  type="submit"
                  disabled={!pasteText.trim() || extraction.loading}
                  className="flex h-[38px] items-center gap-2 rounded-[11px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-[transform,translate,scale,rotate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_var(--primary)] active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <SearchIcon className="size-4" />
                  {extraction.loading ? "Finding…" : "Find tests"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Scrollable: results only. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
          {tab === "ai" ? (
            <AiAssistantResults
              loading={aiAssistant.loading}
              error={aiAssistant.error}
              response={aiAssistant.response}
              locationName={selectedLocation?.name ?? null}
              onOpenInSearch={(lookup) => {
                setQuery(lookup);
                setTab("search");
              }}
            />
          ) : tab === "search" && !searchIsList ? (
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
              onSuggestion={setQuery}
              ai={aiState}
            />
          ) : (
            <MessageExtractionResults
              text={tab === "paste" ? submittedPasteText : trimmedQuery}
              detected={extraction.detected}
              packages={extraction.packages}
              notOffered={extraction.notOffered}
              unmatched={extraction.unmatched}
              locationName={selectedLocation?.name ?? null}
              loading={extraction.loading}
              addedTestIds={addedTestIds}
              onAdd={handleAdd}
              onRemove={handleRemoveTest}
              onAddMany={handleAddMany}
              addedProfileIds={addedProfileIds}
              onAddPackage={(result) => applyPackage(toPackageLine(result))}
              onRemovePackage={(profileId) => removeLineItem({ kind: "package", profileId })}
              ai={messageAi}
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

      <aside
        className="h-full min-w-[340px] flex-1 overflow-hidden bg-card transition-colors duration-300 avm-fade-up"
        style={{ animationDelay: "120ms" }}
      >
        <QuotationPanel
          quotation={quotation}
          whatsappMessage={whatsappMessage}
          locationLabel={locationLabel}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          onRemove={handleRemove}
          onClear={clear}
        />
      </aside>
    </div>
  );
}
