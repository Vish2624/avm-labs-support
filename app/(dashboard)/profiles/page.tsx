import { listActiveLocations } from "@/lib/database/locations";
import { NoLocations } from "@/components/layout/no-locations";
import { ProfileSearchClient } from "@/components/profiles/profile-search-client";

// Packages — search bundled test profiles by name or by one-or-more test
// names, ranked by match count. Auth is enforced by the parent (dashboard)
// layout's requireUser().
export default async function ProfilesPage() {
  const locations = await listActiveLocations();

  if (locations.length === 0) {
    return <NoLocations title="Packages" />;
  }

  return <ProfileSearchClient locations={locations} />;
}
