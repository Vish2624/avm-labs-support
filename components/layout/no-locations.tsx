import { PageHeader } from "./page-header";

// Shared empty state for the pages that need at least one active location
// (Support Workspace, Profile Search) when none is configured yet.
export function NoLocations({ title }: { title: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl p-6 lg:p-8">
      <PageHeader
        title={title}
        description="No active locations are configured yet. Ask an admin to add one before searching."
      />
    </main>
  );
}
