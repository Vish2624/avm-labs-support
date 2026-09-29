"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyIcon, ExternalLinkIcon, InfoIcon, SearchIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTat } from "@/lib/utils/format-tat";
import { AvailabilityPill } from "./availability-pill";
import { resultsTitleClassName } from "./search-results";
import type { ServiceTypeFilter } from "@/lib/constants/service-types";
import { isPackageName } from "@/lib/search/is-package-name";
import type { AiAnswer, AiAssistantResponse, AiSuggestion, FastingInfo, TestQuestionSubject } from "@/types/ai-assistant";


const BULLET = /^\s*[•\-*]\s+/;
const NOTE = /^note:/i;
/** A price as the app writes it, e.g. "5.620 BHD", "183.00 AED". */
const PRICE = /(\d[\d,]*\.\d+ (?:BHD|AED|SAR))/;

/**
 * Splits "Name – detail" on the en dash the replies use; null when there's
 * none. A plain hyphen isn't a separator — names like "HDL Cholesterol - Direct" contain one.
 */
function splitItem(text: string): [string, string] | null {
  const match = text.match(/^(.+?)\s+–\s+(.+)$/);
  return match ? [match[1], match[2]] : null;
}

/**
 * The reply as a WhatsApp message: test names in *bold* and the medical
 * note in _italics_ (WhatsApp's own markup), otherwise exactly the text shown.
 */
function toWhatsAppText(reply: string): string {
  return reply
    .split("\n")
    .map((line) => {
      if (NOTE.test(line.trim())) return `_${line.trim()}_`;
      if (!BULLET.test(line)) return line;
      const body = line.replace(BULLET, "");
      const parts = splitItem(body);
      return parts ? `• *${parts[0]}* – ${parts[1]}` : `• ${body}`;
    })
    .join("\n");
}

/** A detail with any price in it highlighted. */
function Detail({ text }: { text: string }) {
  return (
    <>
      {text.split(PRICE).map((part, index) =>
        PRICE.test(part) ? (
          <span key={index} className="font-semibold whitespace-nowrap text-primary tabular-nums">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * The assistant's reply laid out for reading: the greeting/heading lines in
 * bold, "• Name – detail" lines as a list (name bold, detail muted, prices
 * highlighted), and the medical note as a small callout at the end.
 */
function FormattedReply({ text }: { text: string }) {
  // Group consecutive bullet lines into one list; keep paragraphs apart.
  const blocks: ({ kind: "text"; line: string } | { kind: "list"; items: string[] } | { kind: "note"; line: string })[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (NOTE.test(line)) blocks.push({ kind: "note", line });
    else if (BULLET.test(raw)) {
      const item = raw.replace(BULLET, "").trim();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else blocks.push({ kind: "text", line });
  }

  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground">
      {blocks.map((block, index) => {
        if (block.kind === "note") {
          return (
            <p key={index} className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              {block.line}
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="flex flex-col gap-1.5">
              {block.items.map((item, itemIndex) => {
                const parts = splitItem(item);
                return (
                  <li key={itemIndex} className="flex gap-2.5">
                    <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>
                      {parts ? (
                        <>
                          <span className="font-medium">{parts[0]}</span>
                          <span className="text-muted-foreground"> — </span>
                          <span className="text-muted-foreground">
                            <Detail text={parts[1]} />
                          </span>
                        </>
                      ) : (
                        <Detail text={item} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }
        // The first line ("Hi! …") and any heading ending in ":" read bold.
        const heading = index === 0 || block.line.endsWith(":");
        return (
          <p key={index} className={heading ? "font-semibold" : undefined}>
            <Detail text={block.line} />
          </p>
        );
      })}
    </div>
  );
}

export function aiSuggestionKey(item: AiSuggestion): string {
  return item.kind === "test" ? `test:${item.testId}` : `package:${item.profileId}`;
}

/**
 * Asks /api/ai-assistant only when the agent submits (the "Ask Assistant" button),
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
    /** The last question asked, re-asked when the location/filter changes. */
    question: string | null;
  }>({ loading: false, error: null, response: null, key: null, question: null });
  const key = JSON.stringify([locationId, serviceType]);
  // Only the latest request may update the answer — a slow reply for the
  // previous location must never overwrite the new one.
  const requestIdRef = useRef(0);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || !locationId) return;
      const requestId = ++requestIdRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null, question: trimmed }));
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
        const answer = (await response.json()) as AiAssistantResponse;
        if (requestId !== requestIdRef.current) return;
        setState({ loading: false, error: null, response: answer, key, question: trimmed });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        const message = error instanceof Error ? error.message : "Something went wrong";
        setState({ loading: false, error: message, response: null, key: null, question: trimmed });
      }
    },
    [locationId, serviceType, key]
  );

  // Prices are per location/service type: after switching either, the last
  // question is asked again for the new one.
  const staleQuestion = state.response && state.key !== key && !state.loading ? state.question : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one request per location switch, not a render loop
    if (staleQuestion) ask(staleQuestion);
  }, [staleQuestion, ask]);

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
          // Enter asks; Shift+Enter is a new line (not mid IME composition).
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (value.trim() && !loading) onSubmit();
          }
        }}
        placeholder="Ask about the customer's need, e.g. “I want to lose weight, which tests should I check before taking any medicine?”"
        aria-label="Question for the Support Assistant"
        autoFocus
        className="h-24 w-full resize-y rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/12"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Suggests tests from our own test list — you choose what goes on the quote.
          <span className="max-md:hidden"> Enter to ask · Shift+Enter for a new line.</span>
        </span>
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground transition-[background,translate,scale,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_var(--primary)] active:scale-[0.97] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <SparklesIcon className="size-4" />
          {loading ? "Thinking…" : "Ask Assistant"}
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
        <p className="text-[15px] font-medium">Support Assistant</p>
        <div className="flex max-w-[440px] flex-wrap justify-center gap-1.5">
          {["Tests for hair fall", "Diabetes checkup", "PCOS tests", "Does thyroid test need fasting?", "Price of HbA1c"].map(
            (example) => (
              <span
                key={example}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px] text-muted-foreground"
              >
                {example}
              </span>
            )
          )}
        </div>
      </div>
    );
  }

  // Tests first, then profiles, then packages (the sort keeps relevance order within each).
  const order = (item: AiSuggestion) => (item.kind === "test" ? 0 : isPackageName(item.name) ? 2 : 1);
  const results = [...response.results].sort((a, b) => order(a) - order(b));
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

  const reply = response.reply;

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
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

  if (reply) {
    // Chat-style: the question, the ready-to-send reply, then (when there
    // are any) the tests it mentions, to tick and open in Test search.
    const answer = response.answer;
    const headline = answer?.verdict ? VERDICT_HEADLINE[answer.subject][answer.verdict] : null;
    return (
      <div className="flex flex-col gap-4 px-1 pt-2">
        <div className="flex flex-col gap-2.5">
          <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14.5px] text-primary-foreground">
            {response.query}
          </p>
          <div className="group relative w-full max-w-[640px] self-start rounded-2xl rounded-bl-md border border-border bg-card px-5 py-4 shadow-sm avm-fade-up">
            {headline && answer ? (
              <p
                className={cn(
                  "mb-3 inline-flex rounded-lg px-3 py-1.5 text-[15px] font-semibold",
                  answer.subject === "fasting" && answer.verdict === "no" && "bg-success/15 text-success-foreground",
                  answer.subject === "fasting" && answer.verdict !== "no" && "bg-warning/15 text-warning-foreground",
                  answer.subject === "availability" && answer.verdict === "yes" && "bg-success/15 text-success-foreground",
                  answer.subject === "availability" && answer.verdict !== "yes" && "bg-muted text-foreground"
                )}
              >
                {headline}
              </p>
            ) : null}
            <FormattedReply text={reply} />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <span className="text-[11px] text-muted-foreground">
                {response.engine === "gemini" ? "Support Assistant" : "From our records"}
                {locationName ? ` · ${locationName}` : ""}
              </span>
              <button
                type="button"
                onClick={() => copyText(toWhatsAppText(reply))}
                className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-primary transition-[background,scale] duration-200 hover:bg-primary/10 active:scale-95"
              >
                <CopyIcon className="size-3.5" /> Copy
              </button>
            </div>
          </div>
        </div>

        {results.length > 0 ? (
          <>
            {renderGroup("Tests in our list", results)}
            {actions}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1 pt-2">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3.5 dark:bg-primary/[0.07]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
            <SparklesIcon className="size-4" /> AI Understanding
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {response.engine === "gemini" ? "Gemini" : "Built-in test guide"}
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
