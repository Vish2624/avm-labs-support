import { listActiveLocations } from "@/lib/database/locations";
import { CatalogClient } from "@/components/admin/catalog/catalog-client";

// Tests — individual tests: details, price + TAT per location, other names.
export default async function TestsPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Tests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Individual tests, measured directly and ordered on their own. Open one to edit its details, its price and TAT at
          each location, and the other names customers use for it.
        </p>
      </div>

      <CatalogClient type="test" locations={locations} />
    </div>
  );
}
