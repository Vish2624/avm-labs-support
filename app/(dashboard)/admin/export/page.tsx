import { listActiveLocations } from "@/lib/database/locations";
import { listAuditLogEntries } from "@/lib/database/audit-log";
import { ExportOptions } from "@/components/admin/export/export-options";
import { ExportHistory } from "@/components/admin/export/export-history";

// Export — Download current active data as .xlsx: test catalog or a
// location's price list. Always built fresh from the database, never from
// a past upload.
export default async function ExportPage() {
  const [locations, testExports, priceExports] = await Promise.all([
    listActiveLocations(),
    listAuditLogEntries({ action: "export_tests", limit: 10 }),
    listAuditLogEntries({ action: "export_prices", limit: 10 }),
  ]);

  const recentExports = [...testExports, ...priceExports]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">Download current active data as .xlsx.</p>
      </div>

      <ExportOptions locations={locations} />

      <div>
        <h2 className="text-sm font-medium">Recent exports</h2>
        <div className="mt-2">
          <ExportHistory entries={recentExports} />
        </div>
      </div>
    </div>
  );
}
