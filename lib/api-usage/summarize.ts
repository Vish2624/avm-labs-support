import type { ApiCall, ApiKey } from "@/types/api-key";

// Turns the api_calls log into what Admin > API usage shows: per key and per
// feature, today and the last 7 days. Pure, so it's testable without a DB.

/** Gemini's free-tier daily quotas reset at midnight US Pacific time. */
export const QUOTA_TIME_ZONE = "America/Los_Angeles";

/** The quota day (YYYY-MM-DD, Pacific) an instant falls in. */
export function quotaDayOf(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: QUOTA_TIME_ZONE });
}

/** The instant the current quota day started (midnight Pacific). */
export function quotaDayStart(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: QUOTA_TIME_ZONE,
      hourCycle: "h23",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)])
  );
  const sinceMidnightMs = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs);
}

export interface CallStats {
  /** Requests sent (everything except the ones refused for quota). */
  used: number;
  ok: number;
  quota: number;
  /** error, timeout, network or empty answer. */
  failed: number;
  /** Lost a race to a faster key — sent, but the answer wasn't needed. */
  cancelled: number;
  /** Typical (median) and slow (95th percentile) time of successful answers, ms. */
  p50: number | null;
  p95: number | null;
  lastAt: string | null;
  /** When the daily limit was first hit, and whether the key has answered since. */
  quotaAt: string | null;
  okSinceQuota: boolean;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Stats for a set of calls, oldest first. */
export function statsOf(calls: ApiCall[]): CallStats {
  const latencies: number[] = [];
  const stats: CallStats = {
    used: 0,
    ok: 0,
    quota: 0,
    failed: 0,
    cancelled: 0,
    p50: null,
    p95: null,
    lastAt: null,
    quotaAt: null,
    okSinceQuota: false,
  };
  for (const call of calls) {
    stats.lastAt = call.createdAt;
    if (call.outcome === "quota") {
      stats.quota++;
      stats.quotaAt ??= call.createdAt;
      stats.okSinceQuota = false;
      continue;
    }
    stats.used++;
    if (call.outcome === "ok") {
      stats.ok++;
      latencies.push(call.latencyMs);
      if (stats.quotaAt) stats.okSinceQuota = true;
    } else if (call.outcome === "cancelled") stats.cancelled++;
    else stats.failed++;
  }
  latencies.sort((a, b) => a - b);
  stats.p50 = percentile(latencies, 0.5);
  stats.p95 = percentile(latencies, 0.95);
  return stats;
}

/** Successful answers out of the requests that finished (not cancelled), 0-1; null with none. */
export function successRate(stats: CallStats): number | null {
  const finished = stats.ok + stats.failed + stats.quota;
  return finished === 0 ? null : stats.ok / finished;
}

export type KeyState = "paused" | "missing" | "limit" | "failing" | "working" | "idle";

export function keyState(key: ApiKey, today: CallStats): KeyState {
  if (!key.active) return "paused";
  if (!key.hint) return "missing";
  if (today.quotaAt && !today.okSinceQuota) return "limit";
  if (today.failed > 0 && today.failed >= today.ok) return "failing";
  if (today.ok > 0) return "working";
  return "idle";
}

/** The last `days` quota days, oldest first. */
export function lastQuotaDays(now: Date, days: number): string[] {
  const start = quotaDayStart(now).getTime();
  // Noon of each day, so a DST change can't land on the wrong date.
  return Array.from({ length: days }, (_, i) => quotaDayOf(new Date(start - (days - 1 - i) * 86_400_000 + 12 * 3_600_000)));
}

export function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}
