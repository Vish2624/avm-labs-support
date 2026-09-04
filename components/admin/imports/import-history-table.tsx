"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SERVICE_TYPE_LABELS } from "@/lib/constants/service-types";
import type { ImportStatus, PriceListVersion } from "@/types/import";
import type { Location } from "@/types/location";

const STATUS_BADGE_VARIANT: Record<ImportStatus, "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  staging: "outline",
  validated: "secondary",
  approved: "secondary",
  active: "success",
  archived: "outline",
  failed: "destructive",
  rolled_back: "warning",
};

const STATUS_LABELS: Record<ImportStatus, string> = {
  staging: "Staging",
  validated: "Validated",
  approved: "Approved",
  active: "Active",
  archived: "Archived",
  failed: "Failed",
  rolled_back: "Rolled back",
};

// Past price list imports/versions, newest first.
export function ImportHistoryTable({
  versions,
  locationsById,
  onViewDetails,
  onRollback,
}: {
  versions: PriceListVersion[];
  locationsById: Map<string, Location>;
  onViewDetails: (versionId: string) => void;
  onRollback: (version: PriceListVersion) => void;
}) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No imports yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Service type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Activated</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version.id}>
              <TableCell>v{version.versionNumber}</TableCell>
              <TableCell>{locationsById.get(version.locationId)?.name ?? version.locationId}</TableCell>
              <TableCell>{SERVICE_TYPE_LABELS[version.serviceType]}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[version.status]}>{STATUS_LABELS[version.status]}</Badge>
              </TableCell>
              <TableCell>{version.recordCount ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {version.activatedAt ? new Date(version.activatedAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onViewDetails(version.id)}>
                  Details
                </Button>
                {version.status === "archived" ? (
                  <Button size="sm" variant="outline" onClick={() => onRollback(version)}>
                    Roll back to this
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
