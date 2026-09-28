import { cookies } from "next/headers";
import { listActiveLocations } from "@/lib/database/locations";
import { NoLocations } from "@/components/layout/no-locations";
import { WorkspaceClient, type WorkspaceTab } from "@/components/workspace/workspace-client";
import { pickTab } from "@/lib/utils/url-tab";
import { SERVICE_TYPES, SERVICE_TYPE_FILTERS } from "@/lib/constants/service-types";
import { LOCATION_COOKIE } from "@/lib/constants/location-cookie";
import { loadSearchCatalog, searchCatalogUrl } from "@/lib/search/load-search-catalog";
import type { SearchCatalog } from "@/lib/search/search-catalog";

const WORKSPACE_TABS: readonly WorkspaceTab[] = ["search", "paste", "ai"];

// Quote — the single screen an agent uses to search, price, quote, and
// generate a WhatsApp reply. Auth is enforced by the parent (dashboard)
// layout's requireUser(), which also provides the location + quote state.
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; type?: string | string[] }> }) {
  const [locations, { tab, type }, cookieStore] = await Promise.all([listActiveLocations(), searchParams, cookies()]);

  if (locations.length === 0) {
    return <NoLocations title="Quote Builder" />;
  }

  // The search catalog for the agent's location (same cookie as the
  // layout) is rendered into the page, so the very first search is instant
  // instead of waiting for /api/search/catalog to download.
  const initialServiceType = pickTab(type, SERVICE_TYPE_FILTERS, "all");
  const saved = cookieStore.get(LOCATION_COOKIE)?.value;
  const locationId = locations.find((location) => location.id === saved)?.id ?? locations[0].id;
  const serviceTypes = initialServiceType === "all" ? SERVICE_TYPES : [initialServiceType];
  const initialCatalogs: Record<string, SearchCatalog> = Object.fromEntries(
    await Promise.all(
      serviceTypes.map(async (serviceType) => [
        searchCatalogUrl(locationId, serviceType),
        await loadSearchCatalog(locationId, serviceType),
      ])
    )
  );

  return (
    <WorkspaceClient
      initialTab={pickTab(tab, WORKSPACE_TABS, "search")}
      initialServiceType={initialServiceType}
      initialCatalogs={initialCatalogs}
    />
  );
}
