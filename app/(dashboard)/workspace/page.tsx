import { listActiveLocations } from "@/lib/database/locations";
import { NoLocations } from "@/components/layout/no-locations";
import { WorkspaceClient } from "@/components/workspace/workspace-client";

// Quote — the single screen an agent uses to search, price, quote, and
// generate a WhatsApp reply. Auth is enforced by the parent (dashboard)
// layout's requireUser(), which also provides the location + quote state.
export default async function WorkspacePage() {
  const locations = await listActiveLocations();

  if (locations.length === 0) {
    return <NoLocations title="Quote" />;
  }

  return <WorkspaceClient />;
}
