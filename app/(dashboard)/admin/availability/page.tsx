import { listActiveLocations } from "@/lib/database/locations";
import { AvailabilityClient } from "@/components/admin/availability/availability-client";

// Availability — Toggle test/profile availability per location + service
// type without a full re-upload. The only place "temporarily unavailable"
// is reachable — the Excel import's Available column is a plain Yes/No.
export default async function AvailabilityPage() {
  const locations = await listActiveLocations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Availability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toggle test/profile availability per location and service type without a full re-upload.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active locations are configured yet.</p>
      ) : (
        <AvailabilityClient locations={locations} />
      )}
    </div>
  );
}
