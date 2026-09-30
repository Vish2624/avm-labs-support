import { listAllTests } from "@/lib/database/tests";
import { listActiveLocations } from "@/lib/database/locations";
import { listProfileRosters } from "@/lib/catalog/admin-catalog";
import { ProfilesClient } from "@/components/admin/profiles/profiles-client";

// Packages — bundles built from whole profiles plus extra tests, each with
// its own fixed price per location. Agents find them on the Packages page
// and in the Support Assistant.
export default async function PackagesPage() {
  const [tests, locations, profileRosters] = await Promise.all([listAllTests(), listActiveLocations(), listProfileRosters()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Packages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a package from whole profiles plus extra tests, and give it its own price at each location. Agents see
          packages on the Packages page and in the Support Assistant.
        </p>
      </div>

      <ProfilesClient mode="package" tests={tests} locations={locations} profileRosters={profileRosters} />
    </div>
  );
}
