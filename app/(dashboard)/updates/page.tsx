import { listRecentUpdates, type UpdateKind } from "@/lib/database/updates";
import { formatDateTime } from "@/lib/utils/dates";

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

// Tag color per kind — same blue/amber/green palette the rest of the app
// uses for informational / warning / positive states.
const KIND_TAG_CLASSNAME: Record<UpdateKind, string> = {
  price_list_activated: "bg-accent text-accent-foreground",
  availability_changed: "bg-warning/20 text-warning-foreground",
  profile_price_changed: "bg-success/15 text-success-foreground",
  test_added: "bg-success/15 text-success-foreground",
};

export default async function UpdatesPage() {
  const updates = await listRecentUpdates();

  return (
    <main className="mx-auto flex h-full max-w-[1000px] flex-col gap-2 overflow-y-auto px-7 py-6">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">What changed</h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          Price and availability changes across all locations.
        </p>
      </div>

      {updates.length === 0 ? (
        <p className="py-11 text-center text-[15px] text-muted-foreground">No changes recorded yet.</p>
      ) : (
        updates.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-3.5 border-b border-border/60 py-3 transition-transform last:border-b-0 hover:translate-x-0.5"
          >
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ${KIND_TAG_CLASSNAME[u.kind]}`}
            >
              {KIND_LABEL[u.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{u.title}</p>
              {u.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{u.detail}</p> : null}
            </div>
            <time className="shrink-0 text-[13px] text-muted-foreground" dateTime={u.at}>
              {formatDateTime(u.at)}
            </time>
          </div>
        ))
      )}
    </main>
  );
}
