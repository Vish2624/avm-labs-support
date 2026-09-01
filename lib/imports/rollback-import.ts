import "server-only";
import { getPriceListVersion, rollbackToPriceListVersion } from "@/lib/database/imports";
import type { PriceListVersion } from "@/types/import";

/**
 * Transactionally restores a previous archived version as active — recorded
 * as a brand-new version rather than reactivating the old row in place, so
 * history stays append-only (see the rollback_price_list_version Postgres
 * function). This just validates preconditions and returns the new version.
 */
export async function rollbackImport(targetVersionId: string, userId: string): Promise<PriceListVersion> {
  const target = await getPriceListVersion(targetVersionId);
  if (!target) throw new Error(`Import version ${targetVersionId} not found.`);
  if (target.status !== "archived" && target.status !== "rolled_back") {
    throw new Error(`Can only roll back to an archived version (version ${targetVersionId} is "${target.status}").`);
  }

  const { newVersionId } = await rollbackToPriceListVersion(targetVersionId, userId);

  const created = await getPriceListVersion(newVersionId);
  if (!created) throw new Error(`Import version ${newVersionId} disappeared after rollback.`);
  return created;
}
