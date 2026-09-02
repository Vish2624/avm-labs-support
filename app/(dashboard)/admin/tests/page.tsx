import { listActiveLocations } from "@/lib/database/locations";
import { TestsClient } from "@/components/admin/tests/tests-client";

// Tests — Manage the master test catalog (add/update tests, categories,
// descriptions). Pricing is Excel-import-only (Phase 6); this page only
// touches catalog metadata and the active flag.
export default async function TestsPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Tests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the master test catalog. Prices come from the Excel import pipeline, not this page.
        </p>
      </div>

      <TestsClient locations={locations} />
    </div>
  );
}
