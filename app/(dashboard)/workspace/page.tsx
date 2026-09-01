import { listActiveLocations } from "@/lib/database/locations";
import { WorkspaceClient } from "@/components/workspace/workspace-client";

// Support Workspace — the single page an agent uses to search, price,
// quote, and generate a WhatsApp reply. Auth is enforced by the parent
// (dashboard) layout's requireUser().
export default async function WorkspacePage() {
  const locations = await listActiveLocations();

  if (locations.length === 0) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Support Workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No active locations are configured yet. Ask an admin to add one before searching.
        </p>
      </main>
    );
  }

  return <WorkspaceClient locations={locations} />;
}
