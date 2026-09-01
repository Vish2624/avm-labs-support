"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PriceListStagingRow, PriceListVersion } from "@/types/import";

const ROW_STATUS_BADGE_VARIANT: Record<PriceListStagingRow["rowStatus"], "secondary" | "destructive" | "outline"> = {
  ok: "secondary",
  warning: "outline",
  error: "destructive",
};

// One import's validation report + staged rows — what actually happened,
// reconstructed from price_list_staging_rows rather than a recomputed diff.
export function ImportDetails({
  open,
  onOpenChange,
  version,
  rows,
  currencyCode,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: PriceListVersion | null;
  rows: PriceListStagingRow[];
  /** The version's location currency, for displaying staged prices (staging rows don't carry currency themselves). */
  currencyCode: string | null;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{version ? `Version ${version.versionNumber} — ${version.originalFilename}` : "Import details"}</DialogTitle>
          <DialogDescription>
            {version ? `${version.recordCount ?? 0} row(s), uploaded ${new Date(version.createdAt).toLocaleString()}` : null}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.rowNumber ?? "—"}</TableCell>
                    <TableCell>
                      {row.parsed ? (
                        <>
                          <div className="font-medium">{row.parsed.testName}</div>
                          <div className="text-xs text-muted-foreground">{row.parsed.testCode}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.parsed && currencyCode ? formatCurrency({ amount: row.parsed.price, currency: currencyCode }) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROW_STATUS_BADGE_VARIANT[row.rowStatus]}>{row.rowStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.errorMessages.map((issue) => issue.message).join(" ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
