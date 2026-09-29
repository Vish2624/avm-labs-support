"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, LoaderCircleIcon, ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
import { ServiceTypeFilterSelector } from "./search/service-type-filter";
import { TestSearch, looksLikeMessage } from "./search/test-search";
import { SearchResults, type SearchResultGroup } from "./search/search-results";
import { useSemanticMessageMatches } from "./search/use-semantic-search";
import { isPackageName } from "@/lib/search/matching/is-package-name";
import { searchCatalogProfiles, searchCatalogTests, type SearchCatalog } from "@/lib/search/catalog/search-catalog";
import { MessageExtractionResults, useMessageExtraction } from "./paste/message-extractor";
import { QuotationPanel } from "./quote/quotation-panel";
import { PackageSuggestions } from "./quote/package-suggestions";
import { AiAssistantResults, AiQuestionForm, useAiAssistant } from "./assistant/ai-test-assistant";
import { useQuote } from "./quote/quote-provider";
import { useSearchTelemetry } from "./search/use-search-telemetry";
import { imageFromDataTransfer, preloadImageReader, readImageText } from "./paste/image-reader";
import { fetcher } from "@/lib/utils/fetcher";
import { sumMoney } from "@/lib/pricing/money";
import { generateWhatsAppResponse } from "@/lib/whatsapp/generate-response";
import { SERVICE_TYPES, type ServiceType, type ServiceTypeFilter } from "@/lib/constants/service-types";
import { cn } from "@/lib/utils";
import { writeParamToUrl, writeTabToUrl } from "@/lib/utils/url-tab";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSuggestion, ProfileSearchResult } from "@/types/profile";
import type {
  Quotation,
  QuotationLineItem,
  QuotationPackageLine,
  QuotationTestLine,
} from "@/types/quotation";

// Search runs locally in the browser (~10 ms), so only a tiny pause is needed.
const SEARCH_DEBOUNCE_MS = 50;
/** How often the loaded search catalog is refreshed in the background (so price changes come through). */
const CATALOG_REFRESH_MS = 2 * 60_000;
/** A profile whose own name matches the search at least this well (0-100) counts as an exact match. */
const EXACT_PROFILE_SCORE = 90;
/** Gemini is only asked for searches at least this long (not "t", "ts"). */
const AI_SEARCH_MIN_LENGTH = 3;
// Floors for the draggable column split — matches the columns' own min-w
// classes so the divider never drags a column below where its content
// (buttons, filters) would start wrapping badly.
const LEFT_COLUMN_MIN_PX = 380;
const RIGHT_COLUMN_MIN_PX = 340;
const SPLIT_STORAGE_KEY = "avm-workspace-split-v2";
// The search box and pasted text, kept for this browser tab only
// (sessionStorage), so a refresh brings them — and their results — back.
const INPUTS_STORAGE_KEY = "avm-workspace-inputs-v1";
// The redesign's 1.25 : 1 split between "Find tests" and "Quotation".
const DEFAULT_LEFT_PERCENT = 55.5;
// Stable references so a missing SWR response doesn't create a new empty
// array every render — that would retrigger effects keyed on these values.
const EMPTY_PROFILE_SUGGESTIONS: ProfileSuggestion[] = [];

/**
 * One service type's search results, computed in the browser from its
 * loaded catalog (see useSearchCatalog in WorkspaceClient): the full A–Z
 * list when browsing, otherwise the fuzzy matches for `query`.
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

/**
 * From profiles already ranked by match (best first): the top match, plus
 * the cheapest profile among those covering the most selected tests when
 * that's a different one. Same-currency prices only (they all come from one
 * location + service type).
 */
function pickTopAndCheapest(ranked: ProfileSuggestion[]): ProfileSuggestion[] {
  const [top] = ranked;
  if (!top) return EMPTY_PROFILE_SUGGESTIONS;
  const bestCoverage = Math.max(...ranked.map((suggestion) => suggestion.matchedCount));
  const cheapest = ranked
    .filter((suggestion) => suggestion.matchedCount === bestCoverage)
    .reduce((low, suggestion) => (suggestion.price.amount < low.price.amount ? suggestion : low));
  return cheapest.profileId === top.profileId ? [top] : [top, cheapest];
}
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

export type WorkspaceTab = "search" | "paste" | "ai";

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

  // "All" searches both service types at once, grouped in the results —
  // it's a search-time filter only, not a property of the quote itself
  // (each line item already carries its own real ServiceType).
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>(initialServiceType);
  useEffect(() => writeParamToUrl("type", serviceTypeFilter, "all"), [serviceTypeFilter]);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  // In the URL, so a refresh stays on this tab.
  useEffect(() => writeTabToUrl(tab, "search"), [tab]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pasteText, setPasteText] = useState("");
  // A pasted message is only read when the agent asks for it (Find tests
  // button / Enter), not on every keystroke while they paste or edit.
  const [submittedPasteText, setSubmittedPasteText] = useState("");
  function submitPaste() {
    setSubmittedPasteText(pasteText.trim());
  }
  // A message or list pasted into the search box opens the paste tab and
  // is read right away.
  function handlePastedMessage(text: string) {
    setTab("paste");
    setPasteText(text);
    setSubmittedPasteText(text);
  }
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Restore the search box / pasted text after a refresh, then keep saving
  // them. The first effect runs before the saver, so nothing empty
  // overwrites the saved copy.
  const inputsRestoredRef = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(INPUTS_STORAGE_KEY) ?? "null") as {
        query?: unknown;
        pasteText?: unknown;
        submittedPasteText?: unknown;
      } | null;
      if (saved) {
        if (typeof saved.query === "string") {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of this tab's saved inputs
          setQuery(saved.query);
          setDebouncedQuery(saved.query);
        }
        if (typeof saved.pasteText === "string") setPasteText(saved.pasteText);
        if (typeof saved.submittedPasteText === "string") setSubmittedPasteText(saved.submittedPasteText);
      }
    } catch {
      // Storage blocked or unreadable — start empty.
    }
    inputsRestoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!inputsRestoredRef.current) return;
    try {
      window.sessionStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify({ query, pasteText, submittedPasteText }));
    } catch {
      // Storage blocked — nothing is kept across a refresh.
    }
  }, [query, pasteText, submittedPasteText]);

  // Prescription / lab-request image reader (image-reader.ts): an uploaded,
  // pasted or dropped image is read in the browser and its text goes
  // through the same reader as a pasted message.
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageReading, setImageReading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  async function handleImage(image: File) {
    if (imageReading) return;
    setTab("paste");
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(image);
    });
    setImageReading(true);
    try {
      const text = await readImageText(image);
      if (!text) {
        toast.error("No text found in image");
        return;
      }
      setPasteText(text);
      setSubmittedPasteText(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read that image");
    } finally {
      setImageReading(false);
    }
  }
  // Warm the image reader up as soon as the paste tab opens.
  useEffect(() => {
    if (tab === "paste") preloadImageReader();
  }, [tab]);
  function clearImage() {
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }
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
  // Phones show one column at a time; the bottom bar switches between them.
  const [mobileView, setMobileView] = useState<"search" | "quote">("search");
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

  // Pasting anywhere on the page while not typing in a box: an image or a
  // message goes to the paste tab and is read; a short name is searched.
  const pasteHandlersRef = useRef({ handleImage, handlePastedMessage });
  useEffect(() => {
    pasteHandlersRef.current = { handleImage, handlePastedMessage };
  });
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      const image = imageFromDataTransfer(event.clipboardData);
      const text = event.clipboardData?.getData("text").trim() ?? "";
      if (!image && !text) return;
      event.preventDefault();
      if (image) pasteHandlersRef.current.handleImage(image);
      else if (looksLikeMessage(text)) pasteHandlersRef.current.handlePastedMessage(text);
      else {
        setTab("search");
        setQuery(text);
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const trimmedQuery = debouncedQuery.trim();
  const activeServiceTypes: readonly ServiceType[] =
    serviceTypeFilter === "all" ? SERVICE_TYPES : [serviceTypeFilter];
  const isActiveServiceType = (type: ServiceType) => activeServiceTypes.includes(type);
  // An empty search box with In-House or Outsourced picked lists that
  // service type's full priced catalog (tests + profiles, A–Z).
  const browsing = !trimmedQuery && serviceTypeFilter !== "all";

  // Instant search: each location + service type's catalog (tests, aliases,
  // priced tests and profiles) is loaded into the browser once — right when
  // the page opens, not on the first keystroke — and every keystroke is
  // searched locally (lib/search/catalog/search-catalog.ts), with the same fuzzy
  // matching as the server and no request per keystroke. Refreshed in the
  // background so price changes still come through.
  function useSearchCatalog(type: ServiceType) {
    const key =
      locationId && isActiveServiceType(type)
        ? `/api/search/catalog?${new URLSearchParams({ locationId, serviceType: type })}`
        : null;
    // The page arrives with the current location's catalog already in it
    // (initialCatalogs), so the first search doesn't wait for a download.
    return useSWR<SearchCatalog>(key, fetcher, {
      refreshInterval: CATALOG_REFRESH_MS,
      keepPreviousData: false,
      fallbackData: key ? initialCatalogs[key] : undefined,
      revalidateOnMount: !(key && initialCatalogs[key]),
    });
  }
  const inHouseCatalog = useSearchCatalog("in_house");
  const outsourceCatalog = useSearchCatalog("outsource");
  // "All" lists in-house profiles only (see SearchResults).
  const profilesShown = (type: ServiceType) =>
    serviceTypeFilter === "all" ? type === "in_house" : isActiveServiceType(type);

  const inHouseGroup = useCatalogGroup("in_house", inHouseCatalog, {
    wanted: isActiveServiceType("in_house") && (browsing || Boolean(trimmedQuery)),
    browsing,
    query: trimmedQuery,
    showProfiles: profilesShown("in_house"),
  });
  const outsourceGroup = useCatalogGroup("outsource", outsourceCatalog, {
    wanted: isActiveServiceType("outsource") && (browsing || Boolean(trimmedQuery)),
    browsing,
    query: trimmedQuery,
    showProfiles: profilesShown("outsource"),
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
  // What the search shows: tests and profiles only — never packages (the
  // Support Assistant and the Packages page still show those). When
  // something matches exactly — a test's code/name, an alias typed in full,
  // or a profile's own name — only the exact match(es), not the lookalikes;
  // with no exact match, the closest names.
  const queryCompact = trimmedQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isExactTest = (result: SearchTestResult) =>
    result.matchType === "exact" ||
    (result.matchedAlias !== null && result.matchedAlias.toLowerCase().replace(/[^a-z0-9]/g, "") === queryCompact);
  const isExactProfile = (result: ProfileSearchResult) => (result.nameScore ?? 0) >= EXACT_PROFILE_SCORE;
  const rawGroups = activeServiceTypes.map((type) => {
    const group = groupDataByType[type];
    return { ...group, profiles: group.profiles.filter((result) => !isPackageName(result.name)) };
  });
  const anyExact =
    !browsing &&
    rawGroups.some((group) => group.tests.some(isExactTest) || group.profiles.some(isExactProfile));
  const fuzzyGroups = anyExact
    ? rawGroups.map((group) => ({
        ...group,
        tests: group.tests.filter(isExactTest),
        profiles: group.profiles.filter(isExactProfile),
      }))
    : rawGroups;

  // Fuzzy search first; only when it finds nothing at all is Gemini asked
  // (/api/search/ai — tests and profiles only, priced from the DB).
  const fuzzyLoaded = fuzzyGroups.every((group) => !group.testsLoading && !group.profilesLoading);
  const fuzzyEmpty =
    fuzzyLoaded && fuzzyGroups.every((group) => group.tests.length === 0 && group.profiles.length === 0 && !group.testsError);
  const aiSearchKey =
    tab === "search" && !browsing && trimmedQuery.length >= AI_SEARCH_MIN_LENGTH && locationId && fuzzyEmpty
      ? `/api/search/ai?${new URLSearchParams({ q: trimmedQuery, locationId, serviceType: serviceTypeFilter })}`
      : null;
  const { data: aiSearch, isLoading: aiSearchLoading } = useSWR<{
    tests: SearchTestResult[];
    profiles: ProfileSearchResult[];
  }>(aiSearchKey, fetcher, { shouldRetryOnError: false, revalidateOnFocus: false });
  const aiFound = Boolean(aiSearchKey && aiSearch && aiSearch.tests.length + aiSearch.profiles.length > 0);
  const searchGroups: SearchResultGroup[] =
    aiSearchKey && aiSearchLoading
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
  const ruleProfileCount = new Set(fuzzyGroups.flatMap((group) => group.profiles.map((result) => result.profileId))).size;
  const searchTelemetry = useSearchTelemetry({
    query: trimmedQuery,
    enabled: tab === "search",
    loaded: fuzzyLoaded,
    resultCount: rankedTestIds.length + ruleProfileCount,
    rankedTestIds,
    locationId: locationId || null,
  });
  // The search box is for typed searches only; lists, messages and images
  // go through the "Paste text or image" tab.
  const extraction = useMessageExtraction(tab === "paste" ? submittedPasteText : "", locationId, serviceTypeFilter, true);

  // Same free AI for pasted messages: names the reader couldn't recognise.
  const messageAi = useSemanticMessageMatches(
    extraction.loading ? EMPTY_TOKENS : extraction.unmatched,
    locationId,
    serviceTypeFilter,
    // Only as a backup when Gemini didn't read the message.
    extraction.readBy === "rules"
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
  // Profiles (never packages) covering the tests on the quote — just two:
  // the top match, and the cheapest profile among those covering the most
  // of the selected tests. One already on the quote isn't suggested again.
  const profileSuggestions = useMemo(
    () =>
      pickTopAndCheapest(
        (profileData?.results ?? EMPTY_PROFILE_SUGGESTIONS).filter(
          (suggestion) => !addedProfileIds.has(suggestion.profileId) && !isPackageName(suggestion.name)
        )
      ),
    [profileData, addedProfileIds]
  );

  const addedTestIds = useMemo(() => new Set(selectedTestIds), [selectedTestIds]);
  const aiAssistant = useAiAssistant(locationId, serviceTypeFilter);



  function handleAdd(result: SearchTestResult) {
    addLineItem(toTestLine(result));
    // Still added (the agent may be quoting ahead), but flagged right away.
    if (result.availability !== "available") {
      toast.warning(`${result.code} added · ${AVAILABILITY_LABELS[result.availability].toLowerCase()}`);
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
    if (browsing) return;
    for (const group of searchGroups) {
      const next = group.tests.find((result) => !addedTestIds.has(result.testId));
      if (next) {
        handleAdd(next);
        searchTelemetry.recordPick(next.testId);
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
    <div className="flex h-full flex-col">
      <div ref={columnsRef} className="flex min-h-0 flex-1 items-stretch overflow-hidden avm-fade-up [animation-duration:.45s]">
        <section
          style={{ width: `${leftColumnPercent}%` }}
          className={cn(
            "flex h-full flex-none flex-col overflow-hidden max-md:w-full! md:min-w-[380px]",
            mobileView === "quote" && "max-md:hidden"
          )}
        >
          {/* Static: mode tabs, filters and the search/paste box never scroll —
              only the results below them do. */}
          <div
            className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-4 pb-3.5 avm-fade-up md:gap-4 md:px-7 md:pt-[22px] md:pb-[18px]"
            style={{ animationDelay: "50ms" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-nowrap max-md:gap-2">
                {/* Two equal segments with a card that slides under the active one
                    (hidden while the separate AI assistant is open). */}
                <div className="relative grid grid-cols-2 rounded-xl bg-muted p-1 max-md:flex-1">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-[transform,translate,scale,rotate,opacity] duration-400 ease-[cubic-bezier(.34,1.3,.64,1)]",
                      tab === "paste" && "translate-x-full",
                      tab === "ai" && "opacity-0"
                    )}
                  />
                  <button type="button" onClick={() => setTab("search")} className={segmentClassName(tab === "search")}>
                    Search<span className="max-md:hidden"> tests</span>
                  </button>
                  <button type="button" onClick={() => setTab("paste")} className={segmentClassName(tab === "paste")}>
                    Paste<span className="max-md:hidden"> text or image</span>
                  </button>
                </div>
                {/* Kept apart from the search/paste switch: a separate module,
                    not another way of searching. */}
                <button
                  type="button"
                  onClick={() => setTab("ai")}
                  aria-pressed={tab === "ai"}
                  className={cn(
                    "flex h-[42px] shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium whitespace-nowrap md:px-4 transition-[transform,translate,scale,rotate,box-shadow,background] duration-250 hover:-translate-y-px",
                    tab === "ai"
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]"
                      : "border-border text-primary avm-shimmer-bg hover:shadow-[0_8px_20px_-10px_var(--primary)]"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("size-2.5 rotate-45 rounded-[2px]", tab === "ai" ? "bg-primary-foreground" : "bg-primary")}
                  />
                  <span className="md:hidden">Assistant</span>
                  <span className="max-md:hidden">Support Assistant</span>
                </button>
              </div>
              <ServiceTypeFilterSelector value={serviceTypeFilter} onChange={setServiceTypeFilter} />
            </div>

            {tab === "search" ? (
              <div key="search" className="avm-fade-up [animation-duration:.35s]">
                <TestSearch
                  value={query}
                  onChange={setQuery}
                  onSubmit={handleSearchSubmit}
                  inputRef={searchInputRef}
                  onPasteMessage={handlePastedMessage}
                  onPasteImage={handleImage}
                />
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
                onDragOver={(event) => {
                  if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                  event.preventDefault();
                  setImageDragOver(true);
                }}
                onDragLeave={() => setImageDragOver(false)}
                onDrop={(event) => {
                  setImageDragOver(false);
                  const image = imageFromDataTransfer(event.dataTransfer);
                  if (!image) return;
                  event.preventDefault();
                  handleImage(image);
                }}
                className="flex flex-col gap-2.5 avm-fade-up [animation-duration:.35s]"
              >
                <textarea
                  value={pasteText}
                  onChange={(event) => {
                    setPasteText(event.target.value);
                    if (!event.target.value.trim()) setSubmittedPasteText("");
                  }}
                  onPaste={(event) => {
                    const image = imageFromDataTransfer(event.clipboardData);
                    if (!image) return;
                    event.preventDefault();
                    handleImage(image);
                  }}
                  onKeyDown={(event) => {
                    // Enter searches; Shift+Enter is a new line (not mid IME composition).
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      if (pasteText.trim() && !extraction.loading) submitPaste();
                    }
                  }}
                  placeholder="Paste the customer's message or a prescription image, e.g. “Hi, how much for vit d, b12 and a sugar test?”"
                  aria-label="Customer message"
                  autoFocus
                  className={cn(
                    "min-h-28 w-full resize-y rounded-[14px] border border-input bg-card px-4 py-3.5 text-[14.5px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/15",
                    imageDragOver && "border-primary ring-4 ring-primary/15"
                  )}
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const image = event.target.files?.[0];
                      event.target.value = "";
                      if (image) handleImage(image);
                    }}
                  />
                  {imagePreview ? (
                    <div className="relative size-[38px] shrink-0 overflow-hidden rounded-[9px] border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                      <img src={imagePreview} alt="Uploaded image" className="size-full object-cover" />
                      {imageReading ? (
                        <div className="absolute inset-0 grid place-items-center bg-background/70">
                          <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={clearImage}
                          className="absolute top-0 right-0 grid size-4 place-items-center rounded-bl-md bg-background/85 text-muted-foreground hover:text-foreground"
                        >
                          <XIcon className="size-3" />
                        </button>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageReading}
                    className="flex h-[38px] items-center gap-2 rounded-[11px] border border-border bg-card px-3.5 text-[13.5px] font-medium transition-[transform,translate,scale,rotate,border-color] duration-200 hover:-translate-y-px hover:border-primary active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {imageReading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                    {imageReading ? "Reading image…" : "Upload image"}
                  </button>
                  <span className="mr-auto" />
                  <span className="text-xs text-muted-foreground max-md:hidden">
                    <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">Enter</kbd> to search ·{" "}
                    <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">Shift</kbd> +{" "}
                    <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11px]">Enter</kbd> new line
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
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-5 md:px-5">
            {tab === "ai" ? (
              <AiAssistantResults
                loading={aiAssistant.loading}
                error={aiAssistant.error}
                response={aiAssistant.response}
                locationName={selectedLocation?.name ?? null}
                onOpenInSearch={(codes) => {
                  // The selected tests' codes, read (with prices) by the paste reader.
                  setPasteText(codes);
                  setSubmittedPasteText(codes);
                  setTab("paste");
                }}
              />
            ) : tab === "search" ? (
              <SearchResults
                query={debouncedQuery}
                browsing={browsing}
                aiFound={aiFound}
                aiSearching={Boolean(aiSearchKey && aiSearchLoading)}
                exactMatch={anyExact}
                locationName={selectedLocation?.name ?? null}
                groups={searchGroups}
                showGroupHeaders={serviceTypeFilter === "all" || browsing}
                addedTestIds={addedTestIds}
                addedProfileIds={addedProfileIds}
                onAdd={(result) => {
                  handleAdd(result);
                  searchTelemetry.recordPick(result.testId);
                }}
                onRemove={handleRemoveTest}
                onAddPackage={(result) => applyPackage(toPackageLine(result))}
                onRemovePackage={(profileId) => removeLineItem({ kind: "package", profileId })}
                onSuggestion={setQuery}
              />
            ) : (
              <MessageExtractionResults
                text={submittedPasteText}
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
          className="group relative w-0 shrink-0 cursor-col-resize touch-none max-md:hidden"
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
          className={cn(
            "h-full flex-1 overflow-hidden bg-card transition-colors duration-300 avm-fade-up md:min-w-[340px]",
            mobileView === "search" && "max-md:hidden"
          )}
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

      {/* Phones: switch between the search and the quote. */}
      <nav className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-border bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={() => setMobileView("search")}
          aria-pressed={mobileView === "search"}
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
            mobileView === "search" ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}
        >
          <SearchIcon className="size-4" />
          Search
        </button>
        <button
          type="button"
          onClick={() => setMobileView("quote")}
          aria-pressed={mobileView === "quote"}
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
            mobileView === "quote" ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}
        >
          <ReceiptTextIcon className="size-4" />
          Quote
          {lineItems.length > 0 ? (
            <span
              key={lineItems.length}
              className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground avm-check"
            >
              {lineItems.length}
            </span>
          ) : null}
        </button>
      </nav>
    </div>
  );
}
