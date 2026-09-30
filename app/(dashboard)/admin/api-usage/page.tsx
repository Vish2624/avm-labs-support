import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { deleteApiCallsBefore, listApiCallsSince, listApiKeys } from "@/lib/database/api-keys";
import {
  groupBy,
  keyState,
  lastQuotaDays,
  quotaDayOf,
  quotaDayStart,
  statsOf,
  successRate,
} from "@/lib/api-usage/summarize";
import { ApiKeysPanel, type KeyRow } from "@/components/admin/api-usage/api-keys-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ApiCall } from "@/types/api-key";

// Always read fresh — this page is about what's happening now.
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** Calls older than this are deleted when the page is opened, so the log stays small. */
const KEEP_DAYS = 30;
const WEEK_DAYS = 7;

/** The feature names lib/ai/gemini.ts logs calls under. */
const FEATURE_LABELS: Record<string, string> = {
  paste: "Paste text",
  image: "Prescription images",
  search: "Search tests (AI)",
  assistant: "Support Assistant",
};

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

function StatTile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "red" | "amber" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "red" && "text-destructive",
          tone === "amber" && "text-warning-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

async function loadCalls(now: Date): Promise<ApiCall[] | null> {
  try {
    await deleteApiCallsBefore(new Date(now.getTime() - KEEP_DAYS * DAY).toISOString()).catch(() => {});
    return await listApiCallsSince(new Date(quotaDayStart(now).getTime() - (WEEK_DAYS - 1) * DAY - DAY).toISOString());
  } catch {
    return null;
  }
}

// API usage — every Gemini key the app uses (Vercel env keys + keys added
// here), what each is for, how many requests it has made today against its
// daily limit, success rates and response times, per feature and over the
// week. Counts come from api_calls (lib/ai/gemini.ts logs every request);
// Google doesn't report a free key's remaining quota, so "left" is the
// admin's daily limit minus what was counted. Auth: the (admin) layout's
// requireAdmin().
export default async function ApiUsagePage() {
  const now = new Date();
  const [keys, calls] = await Promise.all([listApiKeys(), loadCalls(now)]);

  const dayStart = quotaDayStart(now);
  const nextReset = new Date(dayStart.getTime() + DAY);
  const hoursLeft = Math.max(0, (nextReset.getTime() - now.getTime()) / 3_600_000);
  const resetText = `Daily limits reset at midnight US Pacific — ${nextReset.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  })} Dubai time, in ${Math.floor(hoursLeft)} h ${Math.round((hoursLeft % 1) * 60)} min.`;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">API usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gemini keys, which feature uses each one, and how many requests they&apos;ve made today. {resetText}
        </p>
      </div>
      <Link
        href="/admin/api-usage"
        className="flex h-9 items-center gap-2 rounded-[10px] border border-border px-3.5 text-[13px] font-medium transition-colors hover:bg-muted"
      >
        <RefreshCwIcon className="size-3.5" /> Refresh
      </Link>
    </div>
  );

  if (keys === null || calls === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm">
          <p className="font-semibold">One-time setup needed</p>
          <p>
            Open Supabase → SQL Editor, paste the contents of{" "}
            <code className="rounded bg-muted px-1 font-mono text-[12.5px]">supabase/migrations/20260930120000_api_keys.sql</code>{" "}
            and click Run. Then refresh this page. Until then the app keeps working with the keys set in Vercel — they just
            aren&apos;t counted.
          </p>
        </div>
      </div>
    );
  }

  const today = calls.filter((call) => new Date(call.createdAt) >= dayStart);
  const todayByKey = groupBy(today, (call) => call.keyId);
  const rows: KeyRow[] = keys.map((key) => {
    const stats = statsOf(todayByKey.get(key.id) ?? []);
    return { key, state: keyState(key, stats), today: stats, successRate: successRate(stats) };
  });
  // Working keys first, then problems, then unused / paused.
  const ORDER = { limit: 0, failing: 1, working: 2, idle: 3, missing: 4, paused: 5 } as const;
  rows.sort((a, b) => ORDER[a.state] - ORDER[b.state]);

  const all = statsOf(today);
  const atLimit = rows.filter((row) => row.state === "limit").length;
  const inUse = rows.filter((row) => row.key.active && row.key.hint).length;
  const limitTotal = rows.reduce((sum, row) => sum + (row.key.active && row.key.hint ? (row.key.dailyLimit ?? 0) : 0), 0);
  const allHaveLimits = rows.every((row) => !row.key.active || !row.key.hint || row.key.dailyLimit);

  const byFeature = [...groupBy(today, (call) => call.feature)].map(([feature, featureCalls]) => {
    const stats = statsOf(featureCalls);
    const keyNames = [...new Set(featureCalls.map((call) => keys.find((key) => key.id === call.keyId)?.label ?? "Deleted key"))];
    return { feature, stats, keyNames };
  });

  const days = lastQuotaDays(now, WEEK_DAYS);
  const weekByKey = groupBy(calls, (call) => call.keyId);
  const week = keys.map((key) => {
    const perDay = groupBy(weekByKey.get(key.id) ?? [], (call) => quotaDayOf(call.createdAt));
    return { key, counts: days.map((day) => statsOf(perDay.get(day) ?? []).used) };
  });
  const dayTotals = days.map((_, i) => week.reduce((sum, row) => sum + row.counts[i], 0));
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Requests today"
          value={all.used.toLocaleString()}
          note={
            allHaveLimits && limitTotal > 0
              ? `of ${limitTotal.toLocaleString()} across ${inUse} key${inUse === 1 ? "" : "s"}`
              : `across ${inUse} key${inUse === 1 ? "" : "s"} in use`
          }
        />
        <StatTile
          label="Success rate"
          value={percent(successRate(all))}
          note={`${all.failed} failed · ${all.quota} refused for limits`}
          tone={(successRate(all) ?? 1) < 0.8 ? "red" : (successRate(all) ?? 1) < 0.95 ? "amber" : undefined}
        />
        <StatTile label="Typical response" value={seconds(all.p50)} note={`slowest 5% take ${seconds(all.p95)} or more`} />
        <StatTile
          label="Keys at their limit"
          value={String(atLimit)}
          note={atLimit > 0 ? "other keys are covering for them" : "none today"}
          tone={atLimit > 0 ? "red" : undefined}
        />
      </div>

      <ApiKeysPanel rows={rows} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">By feature · today</h2>
        {byFeature.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No requests yet today.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Typical time</TableHead>
                  <TableHead className="text-right">Slowest 5%</TableHead>
                  <TableHead>Keys used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byFeature.map(({ feature, stats, keyNames }) => (
                  <TableRow key={feature}>
                    <TableCell className="font-medium">{FEATURE_LABELS[feature] ?? feature}</TableCell>
                    <TableCell className="text-right tabular-nums">{stats.used.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(successRate(stats))}</TableCell>
                    <TableCell className="text-right tabular-nums">{seconds(stats.p50)}</TableCell>
                    <TableCell className="text-right tabular-nums">{seconds(stats.p95)}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{keyNames.join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          Requests per key · last {WEEK_DAYS} days
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                {days.map((day, i) => (
                  <TableHead key={day} className="text-right whitespace-nowrap">
                    {i === days.length - 1 ? "Today" : dayLabel(day)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {week.map(({ key, counts }) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium whitespace-nowrap">{key.label}</TableCell>
                  {counts.map((count, i) => (
                    <TableCell
                      key={days[i]}
                      className={cn(
                        "text-right tabular-nums",
                        count === 0 && "text-muted-foreground/60",
                        key.dailyLimit && count >= key.dailyLimit && "font-semibold text-destructive"
                      )}
                    >
                      {count.toLocaleString()}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {dayTotals.map((total, i) => (
                  <TableCell key={days[i]} className="text-right font-semibold tabular-nums">
                    {total.toLocaleString()}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Days run midnight to midnight US Pacific, like Google&apos;s limits. Google doesn&apos;t tell apps how much of a free
          key is left, so &ldquo;left&rdquo; is the daily limit you set minus the requests counted here — check a key&apos;s
          real limit at aistudio.google.com → Usage.
        </p>
      </section>
    </div>
  );
}
