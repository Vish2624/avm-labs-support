import { listActiveLocations } from "@/lib/database/locations";
import { NoLocations } from "@/components/layout/no-locations";
import { WorkspaceClient, type WorkspaceTab } from "@/components/workspace/workspace-client";
import { pickTab } from "@/lib/utils/url-tab";
import { SERVICE_TYPE_FILTERS } from "@/lib/constants/service-types";

const WORKSPACE_TABS: readonly WorkspaceTab[] = ["search", "paste", "ai"];

// Quote — the single screen an agent uses to search, price, quote, and
// generate a WhatsApp reply. Auth is enforced by the parent (dashboard)
// layout's requireUser(), which also provides the location + quote state.
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; type?: string | string[] }> }) {
  const [locations, { tab, type }] = await Promise.all([listActiveLocations(), searchParams]);

  if (locations.length === 0) {
    return <NoLocations title="Quote Builder" />;
  }

  return (
    <WorkspaceClient
      initialTab={pickTab(tab, WORKSPACE_TABS, "search")}
      initialServiceType={pickTab(type, SERVICE_TYPE_FILTERS, "all")}
    />
  );
}
