import { listActiveLocations } from "@/lib/database/locations";
import { ImportsClient } from "@/components/admin/imports/imports-client";

// Import History — Past price list imports/versions, with diff view and
// rollback. Auth is enforced by the parent (admin) layout's requireAdmin().
export default async function ImportsPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Import History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past price list imports/versions, with a per-row breakdown and rollback to any archived version.
        </p>
      </div>

      <ImportsClient locations={locations} />
    </div>
  );
}
