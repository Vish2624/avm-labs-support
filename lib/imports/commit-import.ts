import "server-only";
import { getPriceListVersion, activatePriceListVersion } from "@/lib/database/imports";
import type { PriceListVersion } from "@/types/import";

/**
 * Transactionally activates a validated import — applies its staged rows as
 * the new current test_prices and archives the previously active version
 * for the same (location, service_type). See the
 * activate_price_list_version Postgres function (supabase/migrations) for
 * the actual transaction; this just validates preconditions and returns the
 * updated version.
 */
export async function commitImport(versionId: string, userId: string): Promise<PriceListVersion> {
  const version = await getPriceListVersion(versionId);
  if (!version) throw new Error(`Import version ${versionId} not found.`);
  if (version.status !== "validated") {
    throw new Error(`Import version ${versionId} must be "validated" to activate (is "${version.status}").`);
  }

  await activatePriceListVersion(versionId, userId);

  const updated = await getPriceListVersion(versionId);
  if (!updated) throw new Error(`Import version ${versionId} disappeared after activation.`);
  return updated;
}
