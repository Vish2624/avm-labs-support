"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils/fetcher";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ServiceType } from "@/lib/constants/service-types";
import type { SearchTestResult } from "@/types/search";

// Splits a pasted customer message into candidate test-name tokens — the
// same separators the search box's underlying alias/fuzzy matcher is built
// to tolerate, just applied to a whole message instead of one query.
const SPLIT_PATTERN = /[,\n;/]+|\band\b|\bplus\b/i;

/**
 * "Paste a message" tab: reads test mentions out of a customer's raw
 * message by running each token through the exact same searchTests()
 * pipeline as the search box (via /api/search) and keeping only the top
 * match per token — never a guess, only real alias/catalog matches with a
 * current price at this location + service type.
 */
export function MessageExtractor({
  locationId,
  serviceType,
  addedTestIds,
  onAddMany,
}: {
  locationId: string;
  serviceType: ServiceType;
  addedTestIds: Set<string>;
  onAddMany: (results: SearchTestResult[]) => void;
}) {
  const [paste, setPaste] = useState("");
  const [detected, setDetected] = useState<SearchTestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleExtract() {
    const tokens = paste
      .split(SPLIT_PATTERN)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    if (tokens.length === 0 || !locationId) {
      setDetected([]);
      setSearched(true);
      return;
    }

    setLoading(true);
    try {
      const responses = await Promise.all(
        tokens.map((token) =>
          fetcher<{ results: SearchTestResult[] }>(
            `/api/search?${new URLSearchParams({ q: token, locationId, serviceType })}`
          ).catch(() => ({ results: [] }))
        )
      );
      const found: SearchTestResult[] = [];
      for (const response of responses) {
        const top = response.results[0];
        if (top && !found.some((existing) => existing.testId === top.testId)) found.push(top);
      }
      setDetected(found);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  const newDetected = detected.filter((d) => !addedTestIds.has(d.testId));

  return (
    <div className="flex flex-col gap-3.5">
      <p className="max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
        Paste what the customer sent on WhatsApp. We read the test names out of it — including nicknames
        like &ldquo;sugar test&rdquo; — and you add them in one click.
      </p>
      <Textarea
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        rows={5}
        placeholder="Hi, can you send me prices for sugar test, vitamin d and CBC?"
        className="min-h-[110px] rounded-[18px] text-[15px] leading-relaxed"
      />
      <Button
        type="button"
        size="lg"
        className="self-start"
        onClick={handleExtract}
        disabled={loading || !paste.trim()}
      >
        {loading ? "Reading…" : "Read the message"}
      </Button>

      {searched && !loading && detected.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Found in the message
          </h2>
          <div className="flex flex-col">
            {detected.map((result) => (
              <div
                key={result.testId}
                className="flex items-center gap-4 border-b border-border/60 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{result.officialName}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {result.matchType === "alias" && result.matchedAlias
                      ? `from “${result.matchedAlias}” in the message`
                      : `matched by name · ${result.code}`}
                  </div>
                </div>
                <span className="text-[15.5px] font-semibold tabular-nums">{formatCurrency(result.price)}</span>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="self-start border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => onAddMany(newDetected)}
            disabled={newDetected.length === 0}
          >
            {newDetected.length === 0
              ? "All found tests already added"
              : `Add all ${newDetected.length} to the quotation`}
          </Button>
        </div>
      ) : null}

      {searched && !loading && detected.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tests recognised — try searching instead.</p>
      ) : null}
    </div>
  );
}
