import { listAllTests } from "@/lib/database/tests";
import { SearchesClient } from "@/components/admin/searches/searches-client";

// Missed searches — what agents searched for and didn't find, turned into
// aliases so the next search for it works.
export default async function MissedSearchesPage() {
  const tests = await listAllTests();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Missed searches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Searches from the last 90 days that found nothing, or where agents picked a test below the top result. Add an
          alias and the next search for it finds the right test.
        </p>
      </div>

      <SearchesClient tests={tests} />
    </div>
  );
}
