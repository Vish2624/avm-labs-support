"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import type { ImportDiff, ImportDiffRow, ImportDiffRowStatus } from "@/types/import";

const STATUS_LABELS: Record<ImportDiffRowStatus, string> = {
  new_test: "New test",
  new_price: "Newly priced",
  changed: "Changed",
  unchanged: "Unchanged",
};

const STATUS_BADGE_VARIANT: Record<ImportDiffRowStatus, "default" | "secondary" | "outline"> = {
  new_test: "default",
  new_price: "secondary",
  changed: "secondary",
  unchanged: "outline",
};

type FilterTab = "all" | ImportDiffRowStatus;

// Diff preview (new/newly-priced/changed/unchanged) before activation —
// every value here is a real staged row, never computed on the fly.
export function ImportPreview({ diff }: { diff: ImportDiff }) {
  const [tab, setTab] = useState<FilterTab>("all");
  const rows = tab === "all" ? diff.rows : diff.rows.filter((row) => row.status === tab);

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">All ({diff.rows.length})</TabsTrigger>
          <TabsTrigger value="new_test">New ({diff.newTestCount})</TabsTrigger>
          <TabsTrigger value="new_price">Newly priced ({diff.newPriceCount})</TabsTrigger>
          <TabsTrigger value="changed">Changed ({diff.changedCount})</TabsTrigger>
          <TabsTrigger value="unchanged">Unchanged ({diff.unchangedCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Previous</TableHead>
              <TableHead>New</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <DiffRow key={row.testCode} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DiffRow({ row }: { row: ImportDiffRow }) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.testName}</div>
        <div className="text-xs text-muted-foreground">{row.testCode}</div>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.previous ? (
          <>
            {formatCurrency({ amount: row.previous.price, currency: row.previous.currencyCode })}
            <span className="mx-1">·</span>
            {formatTat(row.previous.tatText)}
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        {formatCurrency({ amount: row.next.price, currency: row.next.currencyCode })}
        <span className="mx-1 text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatTat(row.next.tatText)}</span>
      </TableCell>
      <TableCell className="text-sm">
        {row.priceChangePercent === null ? (
          "—"
        ) : (
          <span
            className={
              row.priceChangePercent > 0
                ? "text-destructive"
                : row.priceChangePercent < 0
                  ? "text-emerald-600 dark:text-emerald-500"
                  : "text-muted-foreground"
            }
          >
            {row.priceChangePercent > 0 ? "+" : ""}
            {row.priceChangePercent}%
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
