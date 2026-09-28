/**
 * Keeps a page's selected tab in the address bar (`?tab=...`), so a refresh
 * or a shared link reopens the same tab. The default tab is left out of the
 * URL. Uses history.replaceState — no navigation, no server round trip.
 */
export function writeTabToUrl(tab: string, defaultTab: string): void {
  writeParamToUrl("tab", tab, defaultTab);
}

/** Same as writeTabToUrl(), for any search param (e.g. the Workspace's `type` filter). */
export function writeParamToUrl(name: string, value: string, defaultValue: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === defaultValue) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/** The `tab` search param if it's one of `allowed`, else the default. */
export function pickTab<T extends string>(value: string | string[] | undefined, allowed: readonly T[], defaultTab: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : defaultTab;
}
