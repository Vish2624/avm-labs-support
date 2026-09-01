import { listActiveLocations } from "@/lib/database/locations";
import { ProfileSearchClient } from "@/components/profiles/profile-search-client";

// Profile Search — search by profile name or by one-or-more test names,
// ranked by match count. Auth is enforced by the parent (dashboard) layout's
// requireUser().
export default async function ProfilesPage() {
  const locations = await listActiveLocations();

  if (locations.length === 0) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Profile Search</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No active locations are configured yet. Ask an admin to add one before searching.
        </p>
      </main>
    );
  }

  return <ProfileSearchClient locations={locations} />;
}
