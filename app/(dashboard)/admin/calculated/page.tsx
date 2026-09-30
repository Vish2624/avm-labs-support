import { listActiveLocations } from "@/lib/database/locations";
import { CatalogClient } from "@/components/admin/catalog/catalog-client";

// Calculated parameters — results derived from other tests (e.g. Serum Globulin).
export default async function CalculatedPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Calculated parameters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Results worked out from other tests, e.g. Serum Globulin from Total Protein + Albumin. They have no price of their
          own: searching one offers its source tests to add to the quote.
        </p>
      </div>

      <CatalogClient type="calculated" locations={locations} />
    </div>
  );
}
