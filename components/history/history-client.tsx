"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote } from "@/components/workspace/quote-provider";
import { fetcher, postJson } from "@/lib/utils/fetcher";
import { formatCurrency } from "@/lib/utils/format-currency";
import { cn } from "@/lib/utils";
import { QUOTE_HISTORY_RETENTION_DAYS, type QuoteHistoryEntry } from "@/types/quote-history";
import type { QuotationLineItem } from "@/types/quotation";

type Scope = "today" | "all";

const RETENTION_MS = QUOTE_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatWhen(iso: string): string {
  if (isToday(iso)) return `Today, ${formatTime(iso)}`;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(iso));
  return `${weekday}, ${formatTime(iso)}`;
}

function expiresIn(iso: string): string {
  const hours = Math.max(0, Math.ceil((new Date(iso).getTime() + RETENTION_MS - Date.now()) / 3_600_000));
  return hours <= 1 ? "expires within the hour" : `expires in ${hours}h`;
}

const segmentClassName = (active: boolean) =>
  cn(
    "h-[30px] rounded-lg px-3 text-[13px] font-medium transition-colors",
    active ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.02_258/0.12)]" : "text-muted-foreground hover:text-foreground"
  );

// Quote History — every reply an agent copied in the last 2 days (then it
// expires). Shows the saved snapshot; "Reopen in Quote" re-prices it from
// current prices before loading it into the Quote screen.
export function HistoryClient() {
  const router = useRouter();
  const { locations, loadQuote } = useQuote();
  const { data, error, isLoading } = useSWR<{ quotes: QuoteHistoryEntry[] }>("/api/quotes", fetcher, {
    revalidateOnFocus: true,
  });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.quotes ?? []).filter((quote) => {
      if (scope === "today" && !isToday(quote.createdAt)) return false;
      if (!needle) return true;
      const haystack = [quote.customerName ?? "", ...quote.lineItems.flatMap((line) => [line.name, line.code])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [data, query, scope]);

  const selected = filtered.find((quote) => quote.id === selectedId) ?? filtered[0] ?? null;

  async function handleCopy(quote: QuoteHistoryEntry) {
    try {
      await navigator.clipboard.writeText(quote.replyText);
      toast.success("Reply copied");
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  async function handleReopen(quote: QuoteHistoryEntry) {
    setReopening(true);
    try {
      const result = await postJson<{
        locationId: string;
        customerName: string;
        lineItems: QuotationLineItem[];
        dropped: string[];
      }>("/api/quotes/reopen", { id: quote.id });
      if (result.lineItems.length === 0) {
        toast.error("None of these tests are priced at this location any more.");
        return;
      }
      loadQuote({ locationId: result.locationId, lineItems: result.lineItems, customerName: result.customerName });
      if (result.dropped.length > 0) {
        toast.warning(`Reopened at current prices. No longer available: ${result.dropped.join(", ")}.`);
      } else {
        toast.success("Reopened at current prices");
      }
      router.push("/workspace");
    } catch (reopenError) {
      toast.error((reopenError as Error).message);
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <section className="flex min-w-0 flex-[1.25_1_0] flex-col border-r border-border">
        <div className="flex shrink-0 flex-col gap-3.5 border-b border-border px-7 pt-[22px] pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Quote history</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Every reply copied in the last {QUOTE_HISTORY_RETENTION_DAYS} days, from the whole team. Quotes expire
              after {QUOTE_HISTORY_RETENTION_DAYS} days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer or test"
              aria-label="Search history"
              className="h-[38px] min-w-[200px] flex-1 rounded-[10px] border border-input bg-card px-3 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
              <button type="button" onClick={() => setScope("today")} className={segmentClassName(scope === "today")}>
                Today
              </button>
              <button type="button" onClick={() => setScope("all")} className={segmentClassName(scope === "all")}>
                Last {QUOTE_HISTORY_RETENTION_DAYS} days
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-5">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-[60px] w-full rounded-xl" />
              <Skeleton className="h-[60px] w-full rounded-xl" />
              <Skeleton className="h-[60px] w-full rounded-xl" />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>
          ) : filtered.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">
              {data?.quotes.length ? "No quotes match." : "No quotes yet — copy a reply on the Quote screen and it shows up here."}
            </p>
          ) : (
            filtered.map((quote) => {
              const location = locationById.get(quote.locationId);
              const active = selected?.id === quote.id;
              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => setSelectedId(quote.id)}
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-xl px-3 py-3.5 text-left transition-colors",
                    active ? "bg-accent" : "hover:bg-muted/70"
                  )}
                >
                  <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {isToday(quote.createdAt)
                      ? formatTime(quote.createdAt)
                      : new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(quote.createdAt))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium">{quote.customerName || "Unnamed customer"}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                      {quote.lineItems.map((line) => line.name).join(", ")}
                    </span>
                  </span>
                  {location ? (
                    <span className="shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {location.code}
                    </span>
                  ) : null}
                  <span className="w-[110px] shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(quote.total)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      <aside className="flex min-w-0 flex-[1_1_0] flex-col bg-card">
        {selected ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-[22px]">
              <div>
                <h2 className="text-lg font-semibold">{selected.customerName || "Unnamed customer"}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {formatWhen(selected.createdAt)}
                  {locationById.get(selected.locationId) ? ` · ${locationById.get(selected.locationId)!.name}` : ""} ·{" "}
                  {expiresIn(selected.createdAt)}
                </p>
              </div>
              <div>
                {selected.lineItems.map((line) => (
                  <div
                    key={`${line.kind}:${line.refId}`}
                    className="flex justify-between gap-3 border-b border-border/60 py-2.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{line.name}</span>
                      {line.kind === "package" ? (
                        <span className="shrink-0 rounded-[5px] bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
                          PACKAGE
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(line.price)}</span>
                  </div>
                ))}
                {selected.discountPercent > 0 ? (
                  <div className="flex justify-between pt-3 text-[13px] text-muted-foreground">
                    <span>Volume discount ({selected.discountPercent}%)</span>
                    <span className="tabular-nums line-through">{formatCurrency(selected.subtotal)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-3 text-[15px] font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(selected.total)}</span>
                </div>
              </div>
              <div className="rounded-[4px_14px_14px_14px] bg-bubble px-4 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap text-bubble-foreground">
                {selected.replyText}
              </div>
              <p className="text-xs text-muted-foreground">
                Prices shown are what was quoted at the time. Reopening re-prices everything from the current price
                list.
              </p>
            </div>
            <div className="flex shrink-0 gap-2.5 border-t border-border px-6 pt-3.5 pb-[18px]">
              <button
                type="button"
                onClick={() => handleCopy(selected)}
                className="h-11 flex-1 rounded-xl border border-input bg-card text-sm font-medium transition-colors hover:bg-muted"
              >
                Copy reply
              </button>
              <button
                type="button"
                disabled={reopening}
                onClick={() => handleReopen(selected)}
                className="h-11 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {reopening ? "Reopening…" : "Reopen in Quote"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
            Select a quote to see its details.
          </div>
        )}
      </aside>
    </div>
  );
}
