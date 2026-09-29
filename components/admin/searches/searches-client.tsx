"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TestSelect } from "@/components/admin/test-select";
import { fetcher } from "@/lib/utils/fetcher";
import { formatDateTime } from "@/lib/utils/dates";
import { writeTabToUrl } from "@/lib/utils/url-tab";
import type { Test } from "@/types/test";
import type { MisrankedSearch, MissedSearch, SearchLearningSummary } from "@/types/search";

export type SearchesTab = "missed" | "misranked";
type Tab = SearchesTab;

const SUMMARY_URL = "/api/admin/searches";

// Admin > Missed searches: the search log (use-search-telemetry.ts) as two
// review lists. Adding an alias is the fix — an entry drops off once an
// alias covers it (summarizeSearchEvents()); Dismiss deletes its log rows.
export function SearchesClient({ tests, initialTab = "missed" }: { tests: Test[]; initialTab?: Tab }) {
  const { data, error, isLoading, mutate } = useSWR<SearchLearningSummary>(SUMMARY_URL, fetcher);
  const testById = useMemo(() => new Map(tests.map((test) => [test.id, test])), [tests]);
  const [tab, setTab] = useState<Tab>(initialTab);
  // In the URL, so a refresh stays on this tab.
  useEffect(() => writeTabToUrl(tab, "missed"), [tab]);
  const [mapping, setMapping] = useState<MissedSearch | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const missed = data?.missed ?? [];
  const misranked = data?.misranked ?? [];

  function testLabel(testId: string) {
    const test = testById.get(testId);
    return test ? `${test.officialName} (${test.code})` : "Test no longer in the catalog";
  }

  async function run(key: string, action: () => Promise<Response>, success: string) {
    setBusyKey(key);
    try {
      const response = await action();
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Something went wrong.");
      toast.success(success);
      await mutate();
      return true;
    } catch (caught) {
      toast.error((caught as Error).message);
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  function addAlias(key: string, alias: string, testId: string) {
    return run(
      key,
      () =>
        fetch("/api/admin/aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId, alias, aliasType: "customer_term", confidence: 100 }),
        }),
      `"${alias}" now finds ${testById.get(testId)?.code ?? "the test"}.`
    );
  }

  function dismiss(key: string, body: { kind: "missed"; normalizedQuery: string } | { kind: "misranked"; normalizedQuery: string; testId: string }) {
    return run(
      key,
      () => fetch(SUMMARY_URL, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      "Dismissed."
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="missed">No results ({missed.length})</TabsTrigger>
          <TabsTrigger value="misranked">Wrong top result ({misranked.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : tab === "missed" ? (
        <MissedTable
          rows={missed}
          busyKey={busyKey}
          testLabel={testLabel}
          onAddSuggested={(row) => row.suggestedTestId && addAlias(`missed:${row.normalizedQuery}`, row.query, row.suggestedTestId)}
          onMap={setMapping}
          onDismiss={(row) => dismiss(`missed:${row.normalizedQuery}`, { kind: "missed", normalizedQuery: row.normalizedQuery })}
        />
      ) : (
        <MisrankedTable
          rows={misranked}
          busyKey={busyKey}
          testLabel={testLabel}
          onAddAlias={(row) => addAlias(`misranked:${row.normalizedQuery}|${row.testId}`, row.query, row.testId)}
          onDismiss={(row) =>
            dismiss(`misranked:${row.normalizedQuery}|${row.testId}`, {
              kind: "misranked",
              normalizedQuery: row.normalizedQuery,
              testId: row.testId,
            })
          }
        />
      )}

      <Dialog open={mapping !== null} onOpenChange={(open) => !open && setMapping(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Map &ldquo;{mapping?.query}&rdquo; to a test</DialogTitle>
          </DialogHeader>
          {mapping ? (
            <MapForm
              key={mapping.normalizedQuery}
              row={mapping}
              tests={tests}
              submitting={busyKey === `missed:${mapping.normalizedQuery}`}
              onSubmit={async (alias, testId) => {
                if (await addAlias(`missed:${mapping.normalizedQuery}`, alias, testId)) setMapping(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MissedTable({
  rows,
  busyKey,
  testLabel,
  onAddSuggested,
  onMap,
  onDismiss,
}: {
  rows: MissedSearch[];
  busyKey: string | null;
  testLabel: (testId: string) => string;
  onAddSuggested: (row: MissedSearch) => void;
  onMap: (row: MissedSearch) => void;
  onDismiss: (row: MissedSearch) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No missed searches. When an agent searches for something that finds nothing, it shows up here.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Search</TableHead>
            <TableHead>Times</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Agents then picked</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const busy = busyKey === `missed:${row.normalizedQuery}`;
            return (
              <TableRow key={row.normalizedQuery}>
                <TableCell className="font-medium">{row.query}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.count}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.lastSeenAt)}</TableCell>
                <TableCell className="text-sm">
                  {row.suggestedTestId ? (
                    <>
                      {testLabel(row.suggestedTestId)}
                      {row.suggestedCount > 1 ? (
                        <span className="text-muted-foreground"> · {row.suggestedCount}×</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  {row.suggestedTestId ? (
                    <Button size="sm" disabled={busy} onClick={() => onAddSuggested(row)}>
                      Add alias
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onMap(row)}>
                    {row.suggestedTestId ? "Other test…" : "Map to test…"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(row)}>
                    Dismiss
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MisrankedTable({
  rows,
  busyKey,
  testLabel,
  onAddAlias,
  onDismiss,
}: {
  rows: MisrankedSearch[];
  busyKey: string | null;
  testLabel: (testId: string) => string;
  onAddAlias: (row: MisrankedSearch) => void;
  onDismiss: (row: MisrankedSearch) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing here. When agents skip the top result and pick another test, it shows up here.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Search</TableHead>
            <TableHead>Agents picked</TableHead>
            <TableHead>Times</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const busy = busyKey === `misranked:${row.normalizedQuery}|${row.testId}`;
            return (
              <TableRow key={`${row.normalizedQuery}|${row.testId}`}>
                <TableCell className="font-medium">{row.query}</TableCell>
                <TableCell className="text-sm">{testLabel(row.testId)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.count} of {row.totalPicks} picks
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.lastSeenAt)}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button size="sm" disabled={busy} onClick={() => onAddAlias(row)}>
                    Add alias
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(row)}>
                    Dismiss
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MapForm({
  row,
  tests,
  submitting,
  onSubmit,
}: {
  row: MissedSearch;
  tests: Test[];
  submitting: boolean;
  onSubmit: (alias: string, testId: string) => void;
}) {
  const [alias, setAlias] = useState(row.query);
  const [testId, setTestId] = useState(row.suggestedTestId ?? "");
  const canSubmit = alias.trim().length > 0 && testId !== "" && !submitting;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(alias.trim(), testId);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="missed-alias">Alias</Label>
        <Input id="missed-alias" value={alias} onChange={(event) => setAlias(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Test</Label>
        <TestSelect tests={tests} value={testId} onChange={setTestId} />
      </div>
      <Button type="submit" disabled={!canSubmit}>
        Add alias
      </Button>
    </form>
  );
}
