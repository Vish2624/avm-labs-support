import Link from "next/link";
import { getWebsiteSyncStatus } from "@/lib/database/website-catalog";

// Website catalog — the tests, profiles and prices here are a copy of the
// website's, sent by "Push to support" in the website admin (nothing is
// edited here). Shows the last push, and the team's old aliases that
// couldn't be linked to a website test for certain, to add again by hand.
export default async function WebsiteCatalogPage() {
  const status = await getWebsiteSyncStatus();
  const counts = status.counts;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Website catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tests, profiles, special profiles, prices and report times come from the website. To change one, edit it in the
          website admin and press <span className="font-medium text-foreground">Push to support</span> there.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        {status.pushedAt ? (
          <>
            <p className="font-medium">
              Version {status.version} · pushed {new Date(status.pushedAt).toLocaleString("en-GB")}
            </p>
            {counts && (
              <p className="mt-1 text-muted-foreground">
                {counts.tests} tests · {counts.profiles} profiles · {counts.specials} special profiles
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Nothing has been pushed from the website yet.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Old aliases waiting for a match ({status.unlinkedAliases.length})</h2>
        <p className="text-sm text-muted-foreground">
          The team&apos;s aliases from the old catalogue are linked on every push to the website test with the same lab
          code, or else the same name. These had no certain match. Add the ones still needed on the{" "}
          <Link href="/admin/aliases" className="font-medium text-primary underline-offset-2 hover:underline">
            Aliases
          </Link>{" "}
          page.
        </p>
        {status.unlinkedAliases.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Alias</th>
                  <th className="px-3 py-2 font-medium">Old test</th>
                  <th className="px-3 py-2 font-medium">Old code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {status.unlinkedAliases.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">{a.alias}</td>
                    <td className="px-3 py-2">{a.oldName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.oldCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
