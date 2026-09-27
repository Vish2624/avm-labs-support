import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { listActiveAliases } from "@/lib/database/aliases";
import { recordAuditLog } from "@/lib/database/audit-log";
import {
  deleteMisrankedSearchEvents,
  deleteMissedSearchEvents,
  deleteSearchEventsBefore,
  listSearchEventsSince,
} from "@/lib/database/search-events";
import { summarizeSearchEvents } from "@/lib/search/summarize-search-events";
import { dismissSearchSchema } from "@/lib/validation/search-event-schema";

/** The search log is kept this long, then pruned whenever this page loads. */
const RETENTION_DAYS = 90;

// Admin > Missed searches: what agents searched for and didn't find, or
// found below the top result — see summarizeSearchEvents().
export async function GET() {
  await requireAdmin();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Pruning is housekeeping — a failure shouldn't hide the review lists.
  await deleteSearchEventsBefore(cutoff).catch((error) => console.error("search log prune failed", error));

  const [events, aliases] = await Promise.all([listSearchEventsSince(cutoff), listActiveAliases()]);
  return NextResponse.json(summarizeSearchEvents(events, aliases));
}

// Dismiss one entry: its log rows are deleted, so it only comes back if agents hit it again.
export async function DELETE(request: NextRequest) {
  const user = await requireAdmin();

  const body = await request.json().catch(() => null);
  const parsed = dismissSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const entry = parsed.data;
    if (entry.kind === "missed") await deleteMissedSearchEvents(entry.normalizedQuery);
    else await deleteMisrankedSearchEvents(entry.normalizedQuery, entry.testId);
    // Best-effort, like every audit entry — the rows are already gone.
    await recordAuditLog({ userId: user.id, action: "dismiss_search", entity: "search_events", newValue: entry }).catch(
      () => {}
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
