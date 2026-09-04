import { listRecentUpdates, type UpdateKind } from "@/lib/database/updates";
import { formatDateTime } from "@/lib/utils/dates";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

// Updates — a read-only feed of changes that affect what agents quote:
// price-list activations plus one-off availability / profile-price
// corrections. Auth is enforced by the parent (dashboard) layout.
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<UpdateKind, string> = {
  price_list_activated: "Price list",
  availability_changed: "Availability",
  profile_price_changed: "Profile price",
  test_added: "New test",
};

export default async function UpdatesPage() {
  const updates = await listRecentUpdates();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Updates"
        description="Recent pricing and availability changes across all locations."
      />

      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <Card className="gap-0 divide-y divide-border/40 py-0">
          {updates.map((u) => (
            <div key={u.id} className="flex items-start gap-3 px-4 py-3">
              <Badge variant="outline" className="mt-0.5 shrink-0">
                {KIND_LABEL[u.kind]}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{u.title}</p>
                {u.detail ? (
                  <p className="text-xs text-muted-foreground">{u.detail}</p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={u.at}>
                {formatDateTime(u.at)}
              </time>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
