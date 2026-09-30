import { listActiveLocations } from "@/lib/database/locations";
import { UploadTabs, type UploadTab } from "@/components/admin/upload/upload-tabs";
import { pickTab } from "@/lib/utils/url-tab";

const UPLOAD_TABS: readonly UploadTab[] = ["prices", "profiles"];

// Upload — Excel uploads for the master price list and profiles, laid out
// like the master file, each previewed before anything is saved. Auth is
// enforced by the parent (admin) layout's requireAdmin().
export default async function UploadPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [locations, { tab }] = await Promise.all([listActiveLocations(), searchParams]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the master price list or profile prices from Excel, in the same layout as the master file. Every upload
          shows a preview of the changes before anything is saved.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active locations are configured yet.</p>
      ) : (
        <UploadTabs initialTab={pickTab(tab, UPLOAD_TABS, "prices")} />
      )}
    </div>
  );
}
