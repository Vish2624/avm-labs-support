"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyIcon, ExternalLinkIcon, SearchIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTat } from "@/lib/utils/format-tat";
import { AvailabilityPill } from "./availability-pill";
import { resultsTitleClassName } from "./search-results";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import type { AiAnswer, AiAssistantResponse, AiSuggestion, FastingInfo, TestQuestionSubject } from "@/types/ai-assistant";

const SHORT_NOTICE =
  "Note: These are general suggestions, not a diagnosis. Please consult a qualified doctor for advice, especially before starting or changing any medication.";

/** Plain customer-facing name + what it checks, for common tests; others fall back to the catalog name. */
const CUSTOMER_LABELS: Record<string, [name: string, checks: string]> = {
  HBA: ["HbA1c", "3-month average blood sugar"],
  FBS: ["Fasting Blood Sugar", "blood sugar"],
  PPBS: ["Post-meal Blood Sugar", "blood sugar after food"],
  RBS: ["Random Blood Sugar", "blood sugar"],
  INSFA: ["Fasting Insulin", "insulin resistance"],
  LIPID: ["Lipid Profile", "cholesterol"],
  LFT: ["Liver Function Test", "liver health"],
  KFT: ["Kidney Function Test", "kidney health"],
  TSH: ["Thyroid (TSH)", "thyroid function"],
  TFT: ["Thyroid Profile (T3, T4, TSH)", "thyroid function"],
  FTFT: ["Free Thyroid Profile", "thyroid function"],
  FT3: ["Free T3", "thyroid hormone"],
  FT4: ["Free T4", "thyroid hormone"],
  H6: ["Complete Blood Count (CBC)", "blood count & anaemia"],
  FERR: ["Ferritin", "iron stores"],
  IRON: ["Serum Iron", "iron level"],
  TIBC: ["TIBC", "iron binding"],
  VITDC: ["Vitamin D", "vitamin D level"],
  VITB: ["Vitamin B12", "vitamin B12 level"],
  FOLI: ["Folate", "folate level"],
  SEZN: ["Zinc", "zinc level"],
  CALC: ["Calcium", "calcium level"],
  MG: ["Magnesium", "magnesium level"],
  TEST: ["Testosterone", "hormone balance"],
  LH: ["LH", "hormone balance"],
  FSH: ["FSH", "hormone balance"],
  PRL: ["Prolactin", "hormone balance"],
  DHEA: ["DHEA-S", "hormone balance"],
  AMH: ["AMH", "ovarian reserve"],
  E2: ["Estradiol", "hormone balance"],
  BHCG: ["Beta hCG", "pregnancy hormone"],
  CUA: ["Urine Routine", "urine health"],
  CRP: ["CRP", "inflammation"],
  HSCRP: ["hs-CRP", "heart-related inflammation"],
  ESR: ["ESR", "inflammation"],
  URIC: ["Uric Acid", "gout / uric acid"],
  PSA: ["PSA", "prostate health"],
  SEEL: ["Electrolytes", "sodium & potassium"],
  UALB: ["Urine Microalbumin", "early kidney changes"],
};

const SMALL_WORDS = new Set(["and", "of", "for", "with", "in"]);

/**
 * Catalog names are stored in capitals ("THYROID STIMULATING HORMONE
 * (TSH)"); a customer message reads better as "Thyroid Stimulating Hormone
 * (TSH)". Abbreviations — short words, anything with a digit, anything in
 * brackets — keep their capitals.
 */
function friendlyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  let depth = 0;
  return name
    .split(" ")
    .map((word) => {
      const opens = word.startsWith("(");
      if (opens) depth++;
      const inBrackets = depth > 0;
      if (word.endsWith(")")) depth = Math.max(0, depth - 1);
      const letters = word.replace(/[^A-Z]/g, "");
      if (inBrackets || /\d/.test(word) || letters.length <= 3) {
        return SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word;
      }
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function aiSuggestionKey(item: AiSuggestion): string {
  return item.kind === "test" ? `test:${item.testId}` : `package:${item.profileId}`;
}

/**
 * Asks /api/ai-assistant only when the agent submits (the "Ask AI" button),
 * never per keystroke — each question may call Gemini + Google Search.
 * Kept apart from the search box and pasted-message reader entirely.
 */
export function useAiAssistant(locationId: string, serviceType: ServiceTypeFilter) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    response: AiAssistantResponse | null;
    /** The location + filter the response was priced for. */
    key: string | null;
  }>({ loading: false, error: null, response: null, key: null });
  const key = JSON.stringify([locationId, serviceType]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || !locationId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, locationId, serviceType }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }
      setState({ loading: false, error: null, response: (await response.json()) as AiAssistantResponse, key });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Something went wrong", response: null, key: null });
    }
  }

  // Prices are per location/service type: after switching either, the old
  // answer is hidden until the agent asks again.
  return { loading: state.loading, error: state.error, response: state.key === key ? state.response : null, ask };
}

export function AiQuestionForm({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-2.5"
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Ask about the customer's need, e.g. “I want to lose weight, which tests should I check before taking any medicine?”"
        aria-label="Question for the AI Test Assistant"
        autoFocus
        className="h-24 w-full resize-y rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/12"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Suggests tests from our own test list — you choose what goes on the quote.</span>
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-[background,translate,scale,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_var(--primary)] active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <SparklesIcon className="size-4" />
          {loading ? "Thinking…" : "Ask AI"}
        </button>
      </div>
    </form>
  );
}

function MedicalNotice({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-[12.5px] leading-relaxed">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
      <p>
        <span className="font-semibold">Medical information notice: </span>
        {text}
      </p>
    </div>
  );
}

/**
 * A short, friendly customer message listing the selected tests — names and
 * what each checks, no prices (the quotation's own reply carries those) —
 * plus fasting where it matters and a brief medical guideline.
 */
function buildCustomerMessage(response: AiAssistantResponse, items: AiSuggestion[]): string {
  const about =
    response.kind === "recommendation" && response.topic ? ` for ${response.topic.split(" / ")[0].toLowerCase()}` : "";
  const label = (item: AiSuggestion) => CUSTOMER_LABELS[item.code.toUpperCase()]?.[0] ?? friendlyName(item.name);
  const lines = items.map((item) => {
    const checks = CUSTOMER_LABELS[item.code.toUpperCase()]?.[1];
    return `• ${label(item)}${checks ? ` – ${checks}` : ""}`;
  });
  const fasting = items.filter((item) => item.fasting?.required === "yes");
  return [
    response.kind === "recommendation"
      ? `Hi! Tests commonly considered${about}:`
      : "Hi! Here are the details of the test(s) you asked about:",
    "",
    ...lines,
    ...(fasting.length > 0
      ? [
          "",
          `Fasting needed: ${fasting
            .map((item) => {
              const hours = item.fasting!.note.match(/^[\d–-]+ hours/)?.[0];
              return hours ? `${label(item)} (${hours})` : label(item);
            })
            .join(", ")} — water is fine.`,
        ]
      : []),
    "",
    SHORT_NOTICE,
  ].join("\n");
}

const FASTING_PILL: Record<FastingInfo["required"], { label: string; className: string }> = {
  yes: { label: "Fasting required", className: "bg-warning/25 text-warning-foreground" },
  recommended: { label: "Fasting preferred", className: "bg-warning/15 text-warning-foreground" },
  no: { label: "No fasting", className: "bg-success/15 text-success-foreground" },
};

function FastingPill({ fasting }: { fasting: FastingInfo }) {
  const pill = FASTING_PILL[fasting.required];
  return (
    <span title={fasting.note} className={cn("rounded-full px-2 py-px text-[11.5px] font-medium whitespace-nowrap", pill.className)}>
      {pill.label}
    </span>
  );
}

const VERDICT_HEADLINE: Record<TestQuestionSubject, Partial<Record<NonNullable<AiAnswer["verdict"]>, string>>> = {
  fasting: {
    yes: "Yes — fasting is needed",
    no: "No — fasting is not needed",
    preferred: "Fasting is preferred, not strictly required",
    depends: "Depends on the test",
  },
  availability: { yes: "Yes — available", no: "Not available", depends: "Depends" },
  components: {},
  price: {},
  tat: {},
  details: {},
  general: {},
};

/** The direct reply to a question about named tests: a Yes/No headline plus the per-test lines. */
function AnswerCard({ answer }: { answer: AiAnswer }) {
  const headline = answer.verdict ? VERDICT_HEADLINE[answer.subject][answer.verdict] : null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      {headline ? (
        <p
          className={cn(
            "text-[17px] font-semibold",
            answer.verdict === "no" && answer.subject === "fasting" && "text-success-foreground",
            answer.verdict === "yes" && answer.subject === "fasting" && "text-warning-foreground",
            answer.verdict === "yes" && answer.subject === "availability" && "text-success-foreground"
          )}
        >
          {headline}
        </p>
      ) : null}
      <p className={cn("text-[13.5px] leading-relaxed whitespace-pre-line", headline && "mt-1.5")}>{answer.text}</p>
      {answer.subject === "fasting" ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          General guidance — always follow the doctor&apos;s or the lab&apos;s specific instructions.
        </p>
      ) : null}
    </div>
  );
}

// One suggestion: name, code, why it's relevant, TAT, availability and
// fasting — no price (prices are read in Test search, where tests are added).
// The whole row toggles its checkbox.
function SuggestionRow({
  item,
  checked,
  onCheckedChange,
}: {
  item: AiSuggestion;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[14px] px-2.5 py-3 transition-colors hover:bg-muted/70 avm-row-in",
        checked && "bg-primary/[0.04]",
        item.availability === "unavailable" && "opacity-60"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        aria-label={`Select ${item.name}`}
        className="mt-1"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium">{item.name}</span>
          <span className="rounded-[5px] bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">{item.code}</span>
          {item.kind === "package" ? (
            <span
              title={item.tests.map((test) => test.officialName).join(", ")}
              className="rounded-[5px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary"
            >
              PACKAGE · {item.tests.length} tests
            </span>
          ) : null}
        </div>
        <span className="text-[12.5px] text-foreground/80">{item.reason}</span>
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-muted-foreground">
          <span className="whitespace-nowrap">Ready in {formatTat(item.tatText)}</span>
          <AvailabilityPill status={item.availability} />
          {item.fasting ? <FastingPill fasting={item.fasting} /> : null}
        </div>
      </div>
    </label>
  );
}

export function AiAssistantResults({
  loading,
  error,
  response,
  locationName,
  onOpenInSearch,
}: {
  loading: boolean;
  error: string | null;
  response: AiAssistantResponse | null;
  locationName: string | null;
  /** Switches to Test search with this query (the selected tests' codes, comma-separated). */
  onOpenInSearch: (query: string) => void;
}) {
  // Selection is keyed by the response it belongs to, so a new answer starts
  // from its own defaults (highly relevant + available ticked).
  const [selection, setSelection] = useState<{ response: AiAssistantResponse | null; keys: Set<string> }>({
    response: null,
    keys: new Set(),
  });

  const defaultKeys = useMemo(
    () =>
      new Set(
        (response?.results ?? [])
          .filter((item) => item.relevanceLevel === "high" && item.availability === "available")
          .map(aiSuggestionKey)
      ),
    [response]
  );
  const selectedKeys = selection.response === response ? selection.keys : defaultKeys;

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-2.5 pt-2">
        <span className={resultsTitleClassName}>Understanding the question…</span>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="px-2.5 pt-3 text-sm text-destructive">Couldn&apos;t get suggestions: {error}</p>;
  }
  if (!response) {
    return (
      <div className="flex flex-col items-center gap-2 px-8 pt-14 text-center">
        <SparklesIcon className="size-7 text-primary" />
        <p className="text-[15px] font-medium">AI Test Assistant</p>
        <p className="max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          Type the customer&apos;s question — “which tests for hair fall?”, “customer wants a diabetes checkup”,
          “tests related to PCOS” — or ask about a test: “does thyroid test need fasting?”, “price of HbA1c”. The
          assistant suggests matching tests from our catalog; tick the ones you want and open them in
          Test search to see prices and add them.
        </p>
      </div>
    );
  }

  const results = response.results;
  const high = results.filter((item) => item.relevanceLevel === "high");
  const maybe = results.filter((item) => item.relevanceLevel === "medium");
  const selectedItems = results.filter((item) => selectedKeys.has(aiSuggestionKey(item)));

  function setChecked(item: AiSuggestion, checked: boolean) {
    const next = new Set(selectedKeys);
    if (checked) next.add(aiSuggestionKey(item));
    else next.delete(aiSuggestionKey(item));
    setSelection({ response, keys: next });
  }

  function selectAll(select: boolean) {
    setSelection({ response, keys: new Set(select ? results.map(aiSuggestionKey) : []) });
  }

  // The selected tests go to Test search as a code list ("FERR, TSH, LIPID"),
  // which reads each one — with its price — ready to add to the quotation.
  function openInSearch() {
    if (selectedItems.length === 0) return;
    onOpenInSearch(selectedItems.map((item) => item.code).join(", "));
  }

  const allSelected = results.length > 0 && selectedItems.length === results.length;
  const actions = (
    <div className="flex flex-wrap items-center gap-2 px-2.5">
      <button
        type="button"
        onClick={openInSearch}
        disabled={selectedItems.length === 0}
        className="flex h-9 items-center gap-2 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-[background,translate,scale,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_var(--primary)] active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        <SearchIcon className="size-4" />
        Open selected in Test search ({selectedItems.length})
      </button>
      <button
        type="button"
        onClick={() => selectAll(!allSelected)}
        className="h-9 rounded-[10px] border border-input px-4 text-[13.5px] font-medium transition-[background,translate,scale] duration-200 hover:-translate-y-px hover:bg-muted active:scale-[0.97]"
      >
        {allSelected ? "Clear selection" : "Select all"}
      </button>
    </div>
  );

  // The customer message follows the ticked tests live — no extra step.
  const shownMessage = selectedItems.length > 0 ? buildCustomerMessage(response, selectedItems) : null;

  async function copyMessage() {
    if (!shownMessage) return;
    try {
      await navigator.clipboard.writeText(shownMessage);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  const renderGroup = (title: string, items: AiSuggestion[]) =>
    items.length === 0 ? null : (
      <div className="flex flex-col">
        <span className={cn(resultsTitleClassName, "px-2.5 pb-1")}>{title}</span>
        {items.map((item) => (
          <SuggestionRow
            key={aiSuggestionKey(item)}
            item={item}
            checked={selectedKeys.has(aiSuggestionKey(item))}
            onCheckedChange={(checked) => setChecked(item, checked)}
          />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-4 px-1 pt-2">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3.5 dark:bg-primary/[0.07]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
            <SparklesIcon className="size-4" /> AI Understanding
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {response.engine === "gemini" ? "Gemini + Google Search" : "Built-in test guide"}
            {locationName ? ` · ${locationName}` : ""}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">“{response.query}”</p>
        {response.topic ? (
          <p className="mt-1.5 text-[15px] font-medium">
            {response.topic}
            {response.intent ? <span className="font-normal text-muted-foreground"> — {response.intent}</span> : null}
          </p>
        ) : null}
      </div>

      {response.answer ? <AnswerCard answer={response.answer} /> : null}

      {response.kind === "test_question" ? (
        <>
          {renderGroup(response.answer?.subject === "general" ? "Related tests in our list" : "Test details", results)}
          {actions}
        </>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-border px-4 py-4 text-[13.5px]">
          <p className="font-medium">No sufficiently relevant test was found in the current test list.</p>
          <p className="mt-1 text-muted-foreground">Try describing the customer&apos;s condition, symptom, or testing purpose.</p>
        </div>
      ) : (
        <>
          {renderGroup("Highly relevant", high)}
          {renderGroup("May be relevant", maybe)}
          {actions}
        </>
      )}

      {response.unavailableNote ? (
        <p className="px-2.5 text-[12.5px] text-muted-foreground">{response.unavailableNote}</p>
      ) : null}

      {shownMessage ? (
        <div className="flex flex-col gap-2 rounded-xl border border-success/25 bg-success/[0.07] p-3.5">
          <div className="flex items-center justify-between">
            <span className={resultsTitleClassName}>Message for the customer · no prices</span>
            <button
              type="button"
              onClick={copyMessage}
              className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-primary transition-[background,scale] duration-200 hover:bg-primary/10 active:scale-95"
            >
              <CopyIcon className="size-3.5" /> Copy
            </button>
          </div>
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{shownMessage}</pre>
        </div>
      ) : null}

      <MedicalNotice text={response.warning} />

      {response.sources.length > 0 ? (
        <div className="flex flex-col gap-1 px-2.5 pb-2">
          <span className={resultsTitleClassName}>Sources (Google Search)</span>
          {response.sources.map((source) => (
            <a
              key={source.uri}
              href={source.uri}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 truncate text-[12.5px] text-primary hover:underline"
            >
              <ExternalLinkIcon className="size-3 shrink-0" />
              {source.title}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
