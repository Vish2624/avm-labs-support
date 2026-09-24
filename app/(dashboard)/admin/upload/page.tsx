import { listActiveLocations } from "@/lib/database/locations";
import { UploadTabs } from "@/components/admin/upload/upload-tabs";

// Upload — Excel uploads for price lists, test details and profiles, each
// previewed before anything is saved. Auth is enforced by the parent
// (admin) layout's requireAdmin().
export default async function UploadPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload price lists, test details or profiles from Excel. Every upload shows a preview of the changes before
          anything is saved.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active locations are configured yet.</p>
      ) : (
        <UploadTabs locations={locations} />
      )}
    </div>
  );
}
