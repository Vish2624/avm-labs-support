# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

AVM Labs Support Assistant — an internal tool for a 5-person WhatsApp support team to search
diagnostic tests, get location-specific price/TAT/availability, build a quotation, and generate
a WhatsApp-ready reply, plus an Admin section for updating pricing via a validated Excel pipeline.
`AVM_PLAN.md` is the source of truth for the data model, phased build plan, and a per-phase
"Verified live" log of what's actually been checked against seeded Supabase data — treat it as
more current than `README.md`, which describes an earlier phase.

## Commands

- `npm run dev` — dev server (Turbopack, Next 16's default)
- `npm run build` — production build; explicitly pinned to webpack (`next build --webpack`), not Turbopack
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npx tsc --noEmit` — type-check without emitting
- No test runner is configured (`package.json` has no `test` script, and `tests/{unit,integration,fixtures}/` are empty placeholders). Verification so far has been build + lint + live manual smoke-testing against Supabase seed data.

Local setup: `npm install`, then `cp .env.example .env.local` and fill in the Supabase project's URL/anon key/service-role key (service-role key is server-only — never expose it to the browser).

## Architecture

**Route protection is `proxy.ts`, not `middleware.ts`.** Next 16 renamed Middleware to Proxy — gating lives in `proxy.ts` at the repo root, exporting `proxy()`. It calls `lib/supabase/middleware.ts`'s `updateSession()` to refresh the auth cookie and resolve the caller's role, then redirects unauthenticated requests to `/login` and non-admins hitting `/admin/*` to `/dashboard`. This is a UX convenience, not the sole guard: every protected Server Component/Action/Route Handler independently calls `requireUser()`/`requireAdmin()` (`lib/auth/permissions.ts`).

**Three Supabase clients — pick the right one:**
- `lib/supabase/admin.ts` (`createAdminClient`) — service-role, bypasses RLS. The *only* client used for real business data (tests, prices, aliases, profiles, imports). Server-only; never import from `"use client"` code.
- `lib/supabase/server.ts` (`createAuthServerClient`) — cookie-aware, anon key, RLS-bound. Auth/session only.
- `lib/supabase/client.ts` (`createBrowserSupabaseClient`) — browser, anon key. Also auth/session only.

The browser never queries Postgres directly. All data fetching happens server-side (Server Components, or Route Handlers under `app/api/*`) through the admin client, then reaches Client Components as props or SWR JSON (`lib/utils/fetcher.ts`).

**Search is alias lookup + fuzzy ranking in pure JS, not a SQL round-trip.** `lib/search/search-tests.ts` reimplements pg_trgm-style trigram similarity as a Jaccard score in `lib/search/fuzzy-match.ts` (unit-testable without a DB) rather than querying Postgres for fuzzy matches. Pipeline: normalize the query (`normalize-query.ts`) → exact code/name/short-name match → fuzzy catalog match → exact/fuzzy match against `test_aliases` (admin-curated) → `rank-results.ts` dedupes/orders exact > alias > fuzzy → join to `test_prices` for the requested `(locationId, serviceType)`. A candidate with no current price row there is silently dropped, never shown with placeholder data — the same rule the WhatsApp generator follows (only verified DB fields, nothing invented). `lib/profiles/find-matching-profiles.ts` reuses the same resolved-test-id set to rank profiles by test overlap (`calculate-profile-match.ts`).

**DB row → domain type mapping convention.** Every `lib/database/*.ts` file follows the same shape: a private `*Row` interface mirroring the snake_case Postgres columns, a `map*()` function converting to the camelCase domain type in `types/*.ts`, and query functions built on `createAdminClient()`. Follow this pattern for new tables rather than passing raw Supabase rows around.

**Money is always an integer in the currency's minor unit** (`lib/pricing/money.ts`) — fils/halalas; AED/SAR use 2 decimal places, BHD uses 3 (`CURRENCY_FRACTION_DIGITS`). `addMoney`/`sumMoney`/`multiplyMoney` assert integer amounts and matching currencies; floating point only appears at the final display boundary (`lib/utils/format-currency.ts`). Never construct a `Money` with a decimal `amount`.

**The quotation cart is client-only state**, never persisted to Supabase (`components/workspace/workspace-client.tsx`). Changing location or service type clears it — a quote's line items are priced in one location's currency at one service type, so switching either would otherwise silently mix prices/currencies — surfaced via a `sonner` toast.

**The Excel import pipeline (`lib/excel/*`, `lib/imports/*`) is Phase 6 and not yet implemented** — those files are typed placeholders (`throw new Error("Not implemented: ...")`) for the staged upload → validate → preview/diff → confirm & activate (one Postgres transaction) → archive → rollback flow. `AVM_PLAN.md`'s "Validation Rules" and phase-6 sections define the intended behavior; implement against that rather than re-deriving it.

**Auth/roles:** two Supabase Auth accounts — one shared `support@avmlabs.com` login for all 5 agents, one `admin@avmlabs.com`. Role is read from `user_profiles.role` via the RLS-scoped client (not the service-role client) in `updateSession()`, and every table's RLS policy gates on a `current_user_role()` Postgres helper (`supabase/migrations/20260831120000_initial_schema.sql`).

**Seed data** (`supabase/seed/seed.sql`) is dummy/illustrative only, never real AVM Labs pricing — idempotent via fixed UUIDs + `ON CONFLICT`, safe to re-run.
