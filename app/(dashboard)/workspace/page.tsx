import { listActiveLocations } from "@/lib/database/locations";
import { NoLocations } from "@/components/layout/no-locations";
import { WorkspaceClient } from "@/components/workspace/workspace-client";

// Support Workspace — the single page an agent uses to search, price,
// quote, and generate a WhatsApp reply. Auth is enforced by the parent
// (dashboard) layout's requireUser().
export default async function WorkspacePage() {
  const locations = await listActiveLocations();

  if (locations.length === 0) {
    return <NoLocations title="Support Workspace" />;
  }

  return <WorkspaceClient locations={locations} />;
}
