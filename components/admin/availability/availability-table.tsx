"use client";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS, AVAILABILITY_STATUSES, type AvailabilityStatus } from "@/lib/constants/availability";
import type { AvailabilityRow } from "@/lib/database/availability";

// Per-location/service-type availability toggles, for both tests and
// profiles — the only place "temporarily unavailable" is reachable, since
// the Excel import's Available column is a plain Yes/No.
export function AvailabilityTable({
  rows,
  onChange,
}: {
  rows: AvailabilityRow[];
  onChange: (row: AvailabilityRow, availability: AvailabilityStatus) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing priced at this location and service type yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>TAT</TableHead>
            <TableHead>Availability</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.kind}:${row.priceId}`}>
              <TableCell>
                <Badge variant="outline">{row.kind === "test" ? "Test" : "Profile"}</Badge>
              </TableCell>
              <TableCell>
                {row.label} <span className="text-muted-foreground">({row.code})</span>
              </TableCell>
              <TableCell>{formatCurrency(row.price)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatTat(row.tatText)}</TableCell>
              <TableCell>
                <Select value={row.availability} onValueChange={(next) => next && onChange(row, next as AvailabilityStatus)}>
                  <SelectTrigger className="w-44">
                    <SelectValue>{(value: string) => AVAILABILITY_LABELS[value as AvailabilityStatus]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {AVAILABILITY_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
