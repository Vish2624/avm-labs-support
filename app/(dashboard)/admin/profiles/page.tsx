import { listAllTests } from "@/lib/database/tests";
import { listActiveLocations } from "@/lib/database/locations";
import { ProfilesClient } from "@/components/admin/profiles/profiles-client";

// Profiles — Manage profiles/packages, which tests belong to each, and
// their fixed bundle price per location + service type.
export default async function ProfilesPage() {
  const [tests, locations] = await Promise.all([listAllTests(), listActiveLocations()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Profiles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profiles bundle tests at one fixed price per location, e.g. Liver Profile. Packages are built from profiles under
          Admin → Packages.
        </p>
      </div>

      <ProfilesClient tests={tests} locations={locations} />
    </div>
  );
}
