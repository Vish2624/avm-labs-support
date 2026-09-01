"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ImportHistoryTable } from "./import-history-table";
import { ImportDetails } from "./import-details";
import { RollbackDialog } from "./rollback-dialog";
import { fetcher } from "@/lib/utils/fetcher";
import type { Location } from "@/types/location";
import type { PriceListStagingRow, PriceListVersion } from "@/types/import";

export function ImportsClient({ locations }: { locations: Location[] }) {
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  const { data, isLoading, mutate } = useSWR<{ versions: PriceListVersion[] }>("/api/imports", fetcher);
  const versions = data?.versions ?? [];

  const [detailsVersionId, setDetailsVersionId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsVersion, setDetailsVersion] = useState<PriceListVersion | null>(null);
  const [detailsRows, setDetailsRows] = useState<PriceListStagingRow[]>([]);

  const [rollbackTarget, setRollbackTarget] = useState<PriceListVersion | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  async function handleViewDetails(versionId: string) {
    setDetailsVersionId(versionId);
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/imports/${versionId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not load import details.");
      setDetailsVersion(body.version);
      setDetailsRows(body.rows);
    } catch (error) {
      toast.error((error as Error).message);
      setDetailsVersionId(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleRollback() {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const response = await fetch("/api/imports/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersionId: rollbackTarget.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Rollback failed.");

      toast.success(`Rolled back to version ${rollbackTarget.versionNumber} (as new version ${body.version.versionNumber}).`);
      setRollbackTarget(null);
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRollingBack(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading import history…</p>;
  }

  return (
    <>
      <ImportHistoryTable
        versions={versions}
        locationsById={locationsById}
        onViewDetails={handleViewDetails}
        onRollback={setRollbackTarget}
      />

      <ImportDetails
        open={detailsVersionId !== null}
        onOpenChange={(open) => !open && setDetailsVersionId(null)}
        version={detailsVersion}
        rows={detailsRows}
        currencyCode={detailsVersion ? (locationsById.get(detailsVersion.locationId)?.currencyCode ?? null) : null}
        loading={detailsLoading}
      />

      <RollbackDialog
        target={rollbackTarget}
        onOpenChange={(open) => !open && setRollbackTarget(null)}
        onConfirm={handleRollback}
        rollingBack={rollingBack}
      />
    </>
  );
}
