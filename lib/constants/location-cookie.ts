/**
 * Cookie holding the agent's chosen pricing location id — read by the
 * dashboard layout (server) so the first render already uses it, and
 * written by QuoteProvider (browser) whenever the agent switches.
 */
export const LOCATION_COOKIE = "avm-location";

/** One year — it's a preference, not a session. */
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
