import { listActiveLocations } from "@/lib/database/locations";
import { CatalogClient } from "@/components/admin/catalog/catalog-client";

// Components — orderable tests reported as a group of parameters (e.g. CBC).
export default async function ComponentsPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Components</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tests reported as a group of parameters, e.g. CBC. The component has the price; its parameters are never priced
          or ordered on their own. Searching a parameter (&ldquo;hemoglobin&rdquo;) finds its component.
        </p>
      </div>

      <CatalogClient type="component" locations={locations} />
    </div>
  );
}
