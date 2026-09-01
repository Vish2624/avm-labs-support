import { listActiveLocations } from "@/lib/database/locations";
import { UploadClient } from "@/components/admin/upload/upload-client";

// Upload — Upload a location's price list Excel file. Feeds into staging ->
// validate -> preview -> confirm -> activate. Auth is enforced by the
// parent (admin) layout's requireAdmin().
export default async function UploadPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a location&apos;s price list Excel file. A validation report and diff preview come back before
          anything touches live pricing.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active locations are configured yet.</p>
      ) : (
        <UploadClient locations={locations} />
      )}
    </div>
  );
}
