"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ServiceTypeFilterSelector } from "./search/service-type-filter";
import { TestSearch } from "./search/test-search";
import { SearchResults } from "./search/search-results";
import { useWorkspaceSearch } from "./search/use-workspace-search";
import { useSemanticMessageMatches } from "./search/use-semantic-search";
import { MessageExtractionResults, useMessageExtraction } from "./paste/message-extractor";
import { PasteForm } from "./paste/paste-form";
import { useImagePaste } from "./paste/use-image-paste";
import { preloadImageReader } from "./paste/image-reader";
import { QuotationPanel } from "./quote/quotation-panel";
import { PackageSuggestions } from "./quote/package-suggestions";
import { useQuote } from "./quote/quote-provider";
import { lineKey, toPackageLine, toTestLine } from "./quote/quote-lines";
import { useProfileSuggestions } from "./quote/use-profile-suggestions";
import { AiAssistantResults, AiQuestionForm, useAiAssistant } from "./assistant/ai-test-assistant";
import { ClearSearchButton, MobileViewSwitch, WorkspaceModeTabs, type WorkspaceTab } from "./workspace-mode-tabs";
import { useResizableSplit } from "./use-resizable-split";
import { usePersistedInputs } from "./use-persisted-inputs";
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts";
import type { SearchCatalog } from "@/lib/search/catalog/search-catalog";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { cn } from "@/lib/utils";
import { writeParamToUrl, writeTabToUrl } from "@/lib/utils/url-tab";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult, ProfileSuggestion } from "@/types/profile";
import type { Quotation } from "@/types/quotation";

export type { WorkspaceTab };

const EMPTY_TOKENS: string[] = [];

/**
 * The Quote Builder: find tests (search, paste text/image, or the Support
 * Assistant) on the left; the quotation and WhatsApp reply on the right.
 * Each area's logic lives in its own folder (search/, paste/, quote/,
 * assistant/) — this component only wires them together.
 */
export function WorkspaceClient({
  initialTab = "search",
  initialServiceType = "all",
  initialCatalogs = {},
}: {
  initialTab?: WorkspaceTab;
  initialServiceType?: ServiceTypeFilter;
  /** Search catalogs rendered into the page, keyed by their /api/search/catalog URL. */
  initialCatalogs?: Record<string, SearchCatalog>;
}) {
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
  const locationName = selectedLocation?.name ?? null;

  // "All" searches both service types at once, grouped in the results —
  // it's a search-time filter only, not a property of the quote itself
  // (each line item already carries its own real ServiceType).
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>(initialServiceType);
  useEffect(() => writeParamToUrl("type", serviceTypeFilter, "all"), [serviceTypeFilter]);
  // In the URL, so a refresh stays on this tab.
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  useEffect(() => writeTabToUrl(tab, "search"), [tab]);
  // Phones show one column at a time.
  const [mobileView, setMobileView] = useState<"search" | "quote">("search");

  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // A pasted message is only read when the agent asks for it (Find tests
  // button / Enter), not on every keystroke while they paste or edit.
  const [pasteText, setPasteText] = useState("");
  const [submittedPasteText, setSubmittedPasteText] = useState("");
  // The Support Assistant's own question box, separate from search and paste.
  const [aiQuestion, setAiQuestion] = useState("");

  usePersistedInputs(
    { query, pasteText, submittedPasteText },
    (saved) => {
      if (saved.query) setQuery(saved.query);
      if (saved.pasteText !== undefined) setPasteText(saved.pasteText);
      if (saved.submittedPasteText !== undefined) setSubmittedPasteText(saved.submittedPasteText);
    },
    searchInputRef
  );

  /** Opens the paste tab and reads `text` straight away. */
  function readMessage(text: string) {
    setTab("paste");
    setPasteText(text);
    setSubmittedPasteText(text);
  }

  const image = useImagePaste({
    locationId,
    serviceType: serviceTypeFilter,
    onStart: () => setTab("paste"),
    onText: (text) => {
      setPasteText(text);
      setSubmittedPasteText(text);
    },
  });
  // Warm the image reader up as soon as the paste tab opens.
  useEffect(() => {
    if (tab === "paste") preloadImageReader();
  }, [tab]);

  useWorkspaceShortcuts(searchInputRef, {
    onSearchTab: tab === "search",
    focusSearch: () => {
      setTab("search");
      searchInputRef.current?.focus();
    },
    editQuery: setQuery,
    searchFor: (text) => {
      setTab("search");
      setQuery(text);
      searchInputRef.current?.focus();
    },
    readMessage,
    readImage: image.handleImage,
  });

  const { columnsRef, leftPercent, resizing, startResize, resetSplit } = useResizableSplit();

  const search = useWorkspaceSearch({
    query,
    locationId,
    serviceTypeFilter,
    enabled: tab === "search",
    initialCatalogs,
  });

  // The search box is for typed searches only; lists, messages and images
  // go through the "Paste text or image" tab.
  const extraction = useMessageExtraction(tab === "paste" ? submittedPasteText : "", locationId, serviceTypeFilter, true);
  // Free in-browser AI for names the reader couldn't recognise — only as a
  // backup when Gemini didn't read the message.
  const messageAi = useSemanticMessageMatches(
    extraction.loading ? EMPTY_TOKENS : extraction.unmatched,
    locationId,
    serviceTypeFilter,
    extraction.readBy === "rules"
  );

  const profiles = useProfileSuggestions(lineItems, locationId);
  const aiAssistant = useAiAssistant(locationId, serviceTypeFilter);

  // The search column's own "Clear all": the search box, the pasted text,
  // what was read from it and the attached image — the quote is untouched.
  const hasSearchInput = Boolean(query || search.debouncedQuery || pasteText || submittedPasteText || image.preview);
  function clearSearch() {
    setQuery("");
    setPasteText("");
    setSubmittedPasteText("");
    image.clearImage();
    if (tab === "search") searchInputRef.current?.focus();
  }

  function handleAdd(result: SearchTestResult) {
    addLineItem(toTestLine(result));
    // Still added (the agent may be quoting ahead), but flagged right away.
    if (result.availability !== "available") {
      toast.warning(`${result.officialName} added · ${AVAILABILITY_LABELS[result.availability].toLowerCase()}`);
    }
  }

  function handleAddMany(results: SearchTestResult[]) {
    if (results.length === 0) return;
    addLineItems(results.map(toTestLine));
    toast.success(`${results.length} test${results.length === 1 ? "" : "s"} added`);
  }

  const removeTest = (testId: string) => removeLineItem({ kind: "test", testId });
  const addPackage = (result: ProfileSearchResult | ProfileSuggestion) => applyPackage(toPackageLine(result));
  const removePackage = (profileId: string) => removeLineItem({ kind: "package", profileId });

  // Enter in the search box adds the top result (across active service
  // types, in_house before outsource) that isn't already in the quote, then
  // clears the box for the next one — so an agent can type a customer's
  // list without touching the mouse. The top result is a profile/package when
  // its name is what was typed ("lipid profile") and no test matches exactly,
  // or when no test matches at all.
  function handleSearchSubmit() {
    const typed = query.trim();
    if (!typed) return;
    const { tests, profiles: matchedProfiles, stillSearching } = search.resultsFor(typed);
    const next = tests.find((result) => !profiles.addedTestIds.has(result.testId));
    const nextProfile = matchedProfiles.find((result) => !profiles.addedProfileIds.has(result.profileId));
    if (nextProfile && (!next || (search.isExactProfile(nextProfile) && !search.isExactTest(next)))) {
      addPackage(nextProfile);
      setQuery("");
      return;
    }
    if (next) {
      handleAdd(next);
      search.telemetry.recordPick(next.testId);
      toast.success(`Added ${next.officialName}`);
      setQuery("");
      return;
    }
    toast.info(
      tests.length + matchedProfiles.length > 0
        ? "Already in the quote"
        : stillSearching
          ? "Still searching…"
          : `Nothing matches “${typed}”`
    );
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
  const whatsappReplies = useMemo(
    () => ({
      detailed: generateWhatsAppResponse(quotation, "detailed"),
      summary: generateWhatsAppResponse(quotation, "summary"),
    }),
    [quotation]
  );
  const locationLabel = selectedLocation ? `${selectedLocation.name} · prices in ${selectedLocation.currencyCode}` : null;

  return (
    <div className="flex h-full flex-col">
      <div ref={columnsRef} className="flex min-h-0 flex-1 items-stretch overflow-hidden">
        <section
          aria-label="Find tests"
          style={{ width: `${leftPercent}%` }}
          className={cn(
            "flex h-full flex-none flex-col overflow-hidden max-md:w-full! md:min-w-[380px]",
            mobileView === "quote" && "max-md:hidden"
          )}
        >
          {/* Static: mode tabs, filters and the search/paste box never scroll —
              only the results below them do. */}
          <div
            className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-4 pb-3.5 md:gap-4 md:px-7 md:pt-[22px] md:pb-[18px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <WorkspaceModeTabs tab={tab} onChange={setTab} />
              <div className="flex items-center gap-2 max-md:w-full max-md:justify-between">
                <ServiceTypeFilterSelector value={serviceTypeFilter} onChange={setServiceTypeFilter} />
                {tab !== "ai" && hasSearchInput ? <ClearSearchButton onClick={clearSearch} disabled={image.reading} /> : null}
              </div>
            </div>

            {tab === "search" ? (
              <div key="search" className="avm-fade-up">
                <TestSearch
                  value={query}
                  onChange={setQuery}
                  onSubmit={handleSearchSubmit}
                  inputRef={searchInputRef}
                  onPasteMessage={readMessage}
                  onPasteImage={image.handleImage}
                />
              </div>
            ) : tab === "ai" ? (
              <div key="ai" className="avm-fade-up">
                <AiQuestionForm
                  value={aiQuestion}
                  onChange={setAiQuestion}
                  onSubmit={() => {
                    // The answer repeats the question, so the box is freed for the next one.
                    aiAssistant.ask(aiQuestion);
                    setAiQuestion("");
                  }}
                  loading={aiAssistant.loading}
                />
              </div>
            ) : (
              <PasteForm
                key="paste"
                value={pasteText}
                onChange={(text) => {
                  setPasteText(text);
                  if (!text.trim()) setSubmittedPasteText("");
                }}
                onSubmit={() => setSubmittedPasteText(pasteText.trim())}
                finding={extraction.loading}
                image={image}
              />
            )}
          </div>

          {/* Scrollable: results only. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-5 md:px-5">
            {tab === "ai" ? (
              <AiAssistantResults
                loading={aiAssistant.loading}
                error={aiAssistant.error}
                response={aiAssistant.response}
                locationName={locationName}
                // The selected tests' codes, read (with prices) by the paste reader.
                onOpenInSearch={readMessage}
              />
            ) : tab === "search" ? (
              <SearchResults
                query={search.debouncedQuery}
                browsing={search.browsing}
                aiFound={search.aiFound}
                aiSearching={search.aiSearching}
                exactMatch={search.exactMatch}
                locationName={locationName}
                groups={search.groups}
                calculated={search.calculated}
                showGroupHeaders={serviceTypeFilter === "all" || search.browsing}
                addedTestIds={profiles.addedTestIds}
                addedProfileIds={profiles.addedProfileIds}
                onAdd={(result) => {
                  handleAdd(result);
                  search.telemetry.recordPick(result.testId);
                }}
                onAddMany={handleAddMany}
                onRemove={removeTest}
                onAddPackage={addPackage}
                onRemovePackage={removePackage}
                onSuggestion={setQuery}
                catalogEmpty={search.catalogEmpty}
              />
            ) : (
              <MessageExtractionResults
                text={submittedPasteText}
                detected={extraction.detected}
                packages={extraction.packages}
                notOffered={extraction.notOffered}
                calculated={extraction.calculated}
                unmatched={extraction.unmatched}
                locationName={locationName}
                loading={extraction.loading}
                addedTestIds={profiles.addedTestIds}
                onAdd={handleAdd}
                onRemove={removeTest}
                onAddMany={handleAddMany}
                addedProfileIds={profiles.addedProfileIds}
                onAddPackage={addPackage}
                onRemovePackage={removePackage}
                ai={messageAi}
                readingImage={image.reading}
              />
            )}
          </div>

          <PackageSuggestions
            suggestions={profiles.suggestions}
            loading={profiles.loading}
            hasSelection={lineItems.length > 0}
            lineItems={lineItems}
            locationName={locationName}
            onUse={addPackage}
          />
        </section>

        {/* Drag to resize the two columns; double-click resets the split. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize columns"
          title="Drag to resize · double-click to reset"
          onPointerDown={(event) => {
            event.preventDefault();
            startResize();
          }}
          onDoubleClick={resetSplit}
          className="group relative w-0 shrink-0 cursor-col-resize touch-none max-md:hidden"
        >
          <div
            className={cn(
              "absolute inset-y-0 -left-1 w-2.5",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-colors",
              "group-hover:after:bg-primary/50",
              resizing && "after:bg-primary"
            )}
          />
        </div>

        <aside
          aria-label="Quotation"
          className={cn(
            "h-full flex-1 overflow-hidden bg-card transition-colors duration-300 md:min-w-[340px]",
            mobileView === "search" && "max-md:hidden"
          )}
        >
          <QuotationPanel
            quotation={quotation}
            whatsappReplies={whatsappReplies}
            locationLabel={locationLabel}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            onRemove={(item) => removeLineItem(lineKey(item))}
            onClear={clear}
          />
        </aside>
      </div>

      <MobileViewSwitch view={mobileView} onChange={setMobileView} quoteCount={lineItems.length} />
    </div>
  );
}
