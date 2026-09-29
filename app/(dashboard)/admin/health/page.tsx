import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { deleteAppEventsBefore, listAppEventsSince } from "@/lib/database/app-events";
import { geminiOwnKeyConfigured, type GeminiKeyRole } from "@/lib/ai/gemini";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppEvent, AppEventKind } from "@/types/app-event";

// Always read fresh — this page is about what's happening now.
export const dynamic = "force-dynamic";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Events older than this are deleted when the page is opened, so the log stays small. */
const KEEP_DAYS = 30;
const RECENT_LIMIT = 50;

const KIND_LABELS: Record<AppEventKind, string> = {
  gemini_error: "Gemini error",
  gemini_timeout: "Gemini too slow",
  gemini_quota: "Daily limit reached",
  gemini_unavailable: "Gemini unavailable — backup used",
  fallback: "Backup used",
  error: "Error",
};

/** How serious each kind is: red needs attention, amber is worth watching. */
const KIND_LEVEL: Record<AppEventKind, "red" | "amber"> = {
  gemini_error: "amber",
  gemini_timeout: "amber",
  gemini_quota: "red",
  gemini_unavailable: "red",
  fallback: "amber",
  error: "red",
};

const KEYS: { role: GeminiKeyRole; label: string; env: string }[] = [
  { role: "reader", label: "Paste text", env: "GEMINI_API_KEY" },
  { role: "image", label: "Prescription images", env: "GEMINI_API_KEY_IMAGE" },
  { role: "search", label: "Search tests (AI)", env: "GEMINI_API_KEY_SEARCH" },
  { role: "assistant", label: "Support Assistant", env: "GEMINI_API_KEY_ASSISTANT" },
];

const LEVEL_STYLES = {
  green: { dot: "bg-success", badge: "bg-success/15 text-success-foreground", label: "Working" },
  amber: { dot: "bg-warning", badge: "bg-warning/20 text-warning-foreground", label: "Some problems" },
  red: { dot: "bg-destructive", badge: "bg-destructive/12 text-destructive", label: "Needs attention" },
  grey: { dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground", label: "Not set" },
} as const;
type Level = keyof typeof LEVEL_STYLES;

/** Prunes events older than KEEP_DAYS, then reads the last 7 days (newest first) and the time it read them at. */
async function loadHealth(): Promise<{ now: number; events: AppEvent[] }> {
  const now = Date.now();
  await deleteAppEventsBefore(new Date(now - KEEP_DAYS * DAY).toISOString()).catch(() => {});
  const events = await listAppEventsSince(new Date(now - 7 * DAY).toISOString());
  return { now, events };
}

function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function StatusBadge({ level, label }: { level: Level; label?: string }) {
  const style = LEVEL_STYLES[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", style.badge)}>
      <span className={cn("size-2 rounded-full", style.dot)} />
      {label ?? style.label}
    </span>
  );
}

// System health — problems the app hit while serving agents (Gemini
// failures, timeouts and quota limits, backups used, search catalog errors),
// recorded by lib/database/app-events.ts. Auth: the (admin) layout's
// requireAdmin().
export default async function SystemHealthPage() {
  const { now, events } = await loadHealth();
  const lastDay = events.filter((event) => now - new Date(event.createdAt).getTime() < DAY);
  const lastHour = lastDay.filter((event) => now - new Date(event.createdAt).getTime() < HOUR);

  const overall: Level = lastHour.some((event) => KIND_LEVEL[event.kind] === "red")
    ? "red"
    : lastDay.length > 0
      ? "amber"
      : "green";

  // Per Gemini key: failures on that key in the last 24 h.
  const keyStatus = KEYS.map((key) => {
    const own = lastDay.filter((event) => event.keyRole === key.role);
    const quota = own.filter((event) => event.kind === "gemini_quota");
    const level: Level = !geminiOwnKeyConfigured(key.role)
      ? "grey"
      : quota.length > 0
        ? "red"
        : own.length > 0
          ? "amber"
          : "green";
    return { ...key, level, failures: own.length, quota: quota.length, last: own[0]?.createdAt ?? null };
  });

  // Same problem grouped: kind + feature + message.
  const groups = new Map<string, { event: AppEvent; day: number; week: number; last: string }>();
  for (const event of events) {
    const key = [event.kind, event.feature, event.keyRole ?? "", event.message].join("|");
    const group = groups.get(key) ?? { event, day: 0, week: 0, last: event.createdAt };
    group.week += 1;
    if (now - new Date(event.createdAt).getTime() < DAY) group.day += 1;
    groups.set(key, group);
  }
  const grouped = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">System health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Problems the app ran into while agents were using it — Gemini failures and limits, and when a backup had to be
            used. Kept for {KEEP_DAYS} days.
          </p>
        </div>
        <Link
          href="/admin/health"
          className="flex h-9 items-center gap-2 rounded-[10px] border border-border px-3.5 text-[13px] font-medium transition-colors hover:bg-muted"
        >
          <RefreshCwIcon className="size-3.5" /> Refresh
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <StatusBadge
          level={overall}
          label={overall === "green" ? "All good" : overall === "amber" ? "Some problems today" : "Needs attention now"}
        />
        <span className="text-sm text-muted-foreground">
          {lastDay.length === 0
            ? "No problems in the last 24 hours."
            : `${lastDay.length} problem${lastDay.length === 1 ? "" : "s"} in the last 24 hours, ${lastHour.length} in the last hour.`}
        </span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">Gemini keys · last 24 hours</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {keyStatus.map((key) => (
            <div key={key.role} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{key.label}</span>
                <StatusBadge level={key.level} />
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                {key.level === "grey"
                  ? `${key.env} isn't set — this feature borrows the other keys.`
                  : key.failures === 0
                    ? "No failures."
                    : `${key.failures} failure${key.failures === 1 ? "" : "s"}${
                        key.quota > 0 ? `, daily limit hit ${key.quota}×` : ""
                      } · last ${timeAgo(key.last!, now)}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">Problems · last 7 days</h2>
        {grouped.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing recorded in the last 7 days.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Problem</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">24 h</TableHead>
                  <TableHead className="text-right">7 days</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(({ event, day, week, last }) => (
                  <TableRow key={`${event.kind}|${event.feature}|${event.keyRole}|${event.message}`}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              KIND_LEVEL[event.kind] === "red" ? "bg-destructive" : "bg-warning"
                            )}
                          />
                          <span className="font-medium">{KIND_LABELS[event.kind]}</span>
                        </span>
                        <span className="text-[12.5px] text-muted-foreground">{event.message}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {event.feature}
                      {event.keyRole ? <span className="text-muted-foreground"> · {event.keyRole} key</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{day}</TableCell>
                    <TableCell className="text-right tabular-nums">{week}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(last, now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {events.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            Latest {Math.min(RECENT_LIMIT, events.length)} events
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, RECENT_LIMIT).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(event.createdAt, now)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{KIND_LABELS[event.kind]}</span>
                      <span className="text-muted-foreground"> — {event.message}</span>
                    </TableCell>
                    <TableCell className="capitalize">
                      {event.feature}
                      {event.keyRole ? <span className="text-muted-foreground"> · {event.keyRole}</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-[12px] whitespace-normal text-muted-foreground">
                      {event.detail ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
