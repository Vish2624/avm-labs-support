# AVM Labs Support Assistant — Build Plan

## Context

AVM Labs needs an internal tool so a 5-person WhatsApp support team can look up diagnostic tests, get the correct location-specific price/TAT/availability, build a quotation, and generate a WhatsApp-ready reply — without manual searching through price sheets, and without pricing mistakes. A separate `/profiles` page lets agents find the right package. An Admin section lets AVM Labs update pricing daily via Excel upload, with no code/AI involvement in the data itself — uploads go through a staging → validate → preview → confirm → activate → archive pipeline so a bad file can never corrupt live pricing, and every activation is a reversible version.

This is a greenfield project (empty directory, no existing code to reuse), so this plan defines the architecture from scratch rather than adapting existing patterns.

**Confirmed decisions (from user):**
- One master test catalog: test code/name is global; each location supplies its own price/TAT/in-house-or-outsourced/availability.
- Auth (revised after the detailed spec introduced explicit support/admin roles): both get real Supabase Auth logins. Admin = `admin@avmlabs.com`. Support = one shared `support@avmlabs.com` account used by all 5 agents (not individual accounts, not a bare link).
- No existing Excel template — schema proposed below, for sign-off before it becomes the import contract.
- Profile/package price is a fixed bundle price per location (not computed from component tests).

**Assumptions I'm flagging for sign-off (not yet asked), stated explicitly so you can override any of them:**
1. The quotation "cart" in the Support Workspace is client-side/session-only (not persisted to DB) — matches the stated requirements, which don't ask for quote history/audit. Easy to add persistence later if wanted.
2. Fuzzy/alias search is pure Postgres text-matching (trigram similarity + an admin-curated alias table) — **not AI**. This only changes which existing verified rows are *surfaced and ranked*; it never invents a code/price. This satisfies "never guess using AI."
3. Excel upload is one file per location per upload (simpler validation, matches "each location has different price lists"). A combined multi-location file can be added later if needed.
4. When a daily upload omits a test that's currently active, that test's data is left unchanged (not auto-deactivated) — avoids accidentally wiping tests just because today's file is a partial update. Admin can explicitly deactivate a test via the Admin UI.
5. Aliases and profile management are curated in the Admin UI (forms), not via Excel — they're low-volume/edited occasionally, unlike the daily bulk price file.

---

## Data Model (Supabase Postgres)

Superseded/refined by the user's detailed structure message (service_type is now an explicit pricing dimension alongside location, not just a boolean attribute; pricing is temporal; TAT is stored as verified free text rather than value+unit):

- `locations` — id, code (DXB/RUH/KHJ/BHR), name, currency, active
- `tests` — id, code (unique), official_name, category, description, active, created_at, updated_at
- `test_aliases` — id, test_id, alias, alias_type, created_at (admin-curated mappings, e.g. "insulin resistance" → Insulin PP)
- `test_components` — id, test_id, component_test_id (a test composed of other tests, e.g. a bundled panel)
- `test_prices` — id, test_id, location_id, service_type ('in_house'|'outsource'), price (integer minor units), currency, tat_text, availability, effective_from, effective_to, version_id, created_at, updated_at — unique(test_id, location_id, service_type, effective range)
- `profiles` — id, code, name, description, active
- `profile_tests` — id, profile_id, test_id, required (join table)
- `profile_prices` — id, profile_id, location_id, service_type, price, currency, tat_text, availability — fixed bundle price, not computed from components
- `price_list_versions` — id, version_number, location_id, service_type, original_filename, status ('staging'|'validated'|'approved'|'active'|'archived'|'failed'|'rolled_back'), created_by, created_at, activated_at — only one **active** version per (location, service_type)
- `price_list_staging_rows` — id, version_id, raw_row (jsonb), parsed fields, row_status, error_messages
- `admin_profiles` — user_id (FK to Supabase Auth), name, role
- `workspace_access_tokens` — id, token_hash, created_by, active (the shared agent link; admin can view/regenerate it)

All DB access happens server-side (Server Actions / Route Handlers) using the Supabase service role — the browser never talks to Supabase directly — so RLS complexity is minimized while still keeping pricing data off the client except through vetted server logic.

Domain types mirroring this schema are already scaffolded in `/types` (test.ts, price.ts, profile.ts, location.ts, quotation.ts, import.ts, auth.ts); central enums live in `lib/constants` (locations, service-types, availability).

## Proposed Excel Schema (needs your sign-off before Phase 6)

**Price list file (one workbook per location + service type):**
| Column | Required | Notes |
|---|---|---|
| Test Code | Yes | matches existing code, or new → flagged "NEW TEST" for admin confirmation |
| Test Name | Yes | |
| Category | No | |
| Price | Yes | numeric |
| TAT | Yes | free text, e.g. "24 hours", "Same day" |
| Service Type | Yes | in_house / outsource |
| Available | Yes | Yes / No |
| Notes | No | |

**Profiles file (one workbook per location + service type):**
| Column | Required |
|---|---|
| Profile Code | Yes |
| Profile Name | Yes |
| Test Codes (comma-separated) | Yes |
| Price | Yes |
| Available | Yes |

## Validation Rules (Upload → Staging → Validate)

Critical errors block the import outright; warnings require explicit admin review before confirming:

- **Errors**: missing required column, missing/duplicate test code, missing/invalid price, invalid currency, invalid service type, invalid location, invalid TAT, invalid availability.
- **Warnings**: new test detected (needs "create" confirmation), large price-change (e.g. >20%), unexpected row-count change vs. the last active version.
- Any error → whole import marked **failed**, nothing touches live data; the previously active version remains active.
- Preview/diff screen shows: new tests, changed rows (old → new price/TAT/availability), unchanged rows.
- **Activate** runs as one Postgres transaction: snapshot the current active version's rows → apply staged changes as the new active version for that (location, service_type) → archive the previous version → mark import activated. Any failure rolls back the whole transaction.
- **Rollback** restores a prior version the same transactional way — itself recorded as a new version (status `rolled_back` retired, new version `active`), so history is append-only and nothing is destructively rewritten.

## Search / Alias Matching

`searchTests(query, locationId, serviceType)`:
1. Check `test_aliases` for a match against the query (handles "insulin resistance" → Insulin PP once admin-configured).
2. Trigram similarity (`pg_trgm`) against official_name/code for typo tolerance.
3. Rank: exact code/name > alias match > trigram similarity score.
4. Join to `test_prices` for the selected location + service type; return only real DB rows (name, code, price, TAT, availability) — never generated text.

Same primitive powers `/profiles`' "search by test names" mode: resolve each input to test_id(s), rank profiles by count of `profile_tests` overlap with the resolved set (see `lib/profiles/calculate-profile-match.ts`, already implemented — pure algorithm, no DB dependency).

## Phased Build (each phase ends in something runnable/testable)

0. **Scaffold** — Next.js (TS, App Router, Tailwind) + shadcn/ui + Supabase client + exceljs installed. Full production folder structure in place: `(auth)/login`, `(dashboard)/{dashboard,workspace,profiles,updates,admin/*}`, `api/*` route stubs, `components/{layout,workspace,profiles,admin,ui}`, `lib/{supabase,auth,search,pricing,profiles,excel,imports,whatsapp,database,validation,constants,utils}`, `types/*`, `tests/{unit,integration,fixtures}`. Real (non-stub) pieces built now because they're pure structure/math, not business data: Supabase clients (browser/server/service-role/middleware), constants (locations/service-types/availability), money arithmetic, profile-match ranking algorithm, domain types, Sidebar/Topbar nav shell. Everything else is a typed placeholder pending its phase. **Open question**: the purpose of `/dashboard` (distinct from `/workspace`) and `/updates` isn't defined yet — flagged for you, not guessed. Verify: app boots, builds, lints clean; Supabase connection healthy once a project is connected.
1. **Schema & seed — DONE.** All tables live via `supabase/migrations/20260831120000_initial_schema.sql` (locations, tests, test_aliases, test_components, price_list_versions, price_list_staging_rows, test_prices, profiles, profile_tests, profile_prices, user_profiles, audit_log), RLS enabled on every table with support/admin policies via a `current_user_role()` helper. Seeded via `supabase/seed/seed.sql`: 4 locations, 5 sample tests, 7 aliases (incl. the "insulin resistance" → Insulin PP example), 14 prices, 1 profile. Verified live: 12/12 tables reachable, alias lookup returns the correct test.
2. **Auth — DONE.** Supabase Auth with two roles (`support`/`admin`) per the resolved decision: one shared `support@avmlabs.com` account for all 5 agents, one `admin@avmlabs.com` account — both real Supabase Auth logins (not a bare shared link). `proxy.ts` gates every `/dashboard/*` route (redirects to `/login` if unauthenticated) and `/admin/*` specifically (redirects non-admins to `/dashboard`); `requireUser()`/`requireAdmin()` in `lib/auth/permissions.ts` back this up server-side in the dashboard/admin layouts — never relying on hiding the nav link alone. Sidebar hides the Admin section for non-admins. Verified live: unauthenticated requests to protected routes 307-redirect to `/login`; both accounts sign in and correctly resolve their role through the real RLS policy (not the service-role bypass).
3. **Search engine — DONE.** `searchTests(query, locationId, serviceType)` in `lib/search/search-tests.ts`, backed by `lib/database/{tests,aliases,prices}.ts`. Alias lookup (exact + fuzzy) and catalog fuzzy matching run as pure, unit-testable JS trigram scoring (`lib/search/fuzzy-match.ts`, a Jaccard reimplementation of the pg_trgm extension already enabled in the schema) rather than a SQL round-trip; `lib/search/rank-results.ts` dedupes/orders exact > alias > fuzzy. Only tests with a current price row at the requested location + service type are ever returned. Verified live against seeded data: "insulin resistance" resolves to Insulin PP via alias, "a1c" resolves to HbA1c, a deliberate typo ("vitmin d") still surfaces Vitamin D via fuzzy alias matching, an exact code match ranks first, a nonsense query returns no results, and a real alias match with no price at the requested location/service type is correctly excluded rather than shown with missing data.
4. **Support Workspace (single page) — DONE.** `WorkspaceClient` (client component, `components/workspace/workspace-client.tsx`) drives location switcher, debounced live search (SWR against `/api/search`, `/api/profiles` — both now real `requireUser()`-gated handlers instead of the Phase-0 `501` stubs), result cards (code/name/price/TAT/availability/service-type badges, alias attribution), add-to-quote, running total, profile suggestions ranked by test overlap, and "Generate WhatsApp message" (`lib/whatsapp/generate-response.ts` + `templates.ts`, built only from the quotation's line-item fields — never generated text). Changing location or service type clears an in-progress quote rather than silently mixing currencies/prices. Verified live (signed in as `support@avmlabs.com`) against seeded data: "insulin resistance" alias → Sample Insulin PP (Dubai/outsource, AED 180.00) with alias attribution shown; correctly returns no results for the same query at Bahrain/in-house (no price row there); "a1c" alias → Sample HbA1c (Dubai/in-house); adding HbA1c surfaces "Sample Diabetes Panel" at 100% match; add-to-quote updates the running total and WhatsApp draft live; Copy button copies the generated message and shows a confirmation toast; switching location/service type shows the "quotation cleared" toast and empties the cart. Fixed one bug found in this pass: `LocationSelector`'s `SelectValue` (Base UI, not Radix) was rendering the raw location UUID in the trigger instead of the name — Base UI's `Select.Value` shows the raw selected value unless given a formatter function, unlike Radix which reflects the matching item's children automatically.
5. **/profiles page — DONE.** `ProfileSearchClient` (`components/profiles/profile-search-client.tsx`) offers two modes via tabs: "by name" (`searchProfilesByName` — new, same exact/fuzzy trigram scoring as `searchTests()` but against profile name/code) and "by test names" (free-text chips, each resolved to a catalog test id by the new `/api/tests/resolve` -> `resolveTestIds()` — a location/service-type-independent extraction of `searchTests()`'s alias+fuzzy matching, factored out into `lib/search/build-search-candidates.ts` so both share one implementation — then ranked by `findMatchingProfiles()`, reused unchanged from Phase 4). Both modes return a result card that expands in place to the profile's full test roster (`ProfileDetail`/`ProfileTestList`, hydrated in one batch query via `lib/profiles/hydrate-profile-tests.ts`), highlighting which tests were actually requested in "by test names" mode. An unresolved chip (no catalog match) is shown in red rather than silently dropped, so the agent knows their typed term didn't match anything real. Verified live (signed in as `admin@avmlabs.com`) against seeded data: "diabetes" -> Sample Diabetes Panel by name at Dubai/in-house; chips "a1c" (resolves to Sample HbA1c) + a nonsense term (stays unresolved, shown in red) -> same profile at 100% match with only HbA1c tagged "Requested" in the expanded roster; removing the resolved chip correctly clears results with a mode-appropriate empty message; confirmed no regression to the Support Workspace's search/profile-suggestions panel after refactoring their shared matching code.
6. **Admin: Excel import pipeline — DONE, pending one manual step (see below).** Scoped to the test price-list import (the "Profiles file" bulk-import proposal in this doc's Excel schema section is superseded by assumption 5 — profile management, including bundle pricing, stays admin-form-managed in Phase 7). `/admin/upload` -> `UploadClient` walks upload -> `/api/imports/validate` (parses via `lib/excel/parse-excel.ts`, applies the zod row schema + duplicate/service-type checks via `lib/excel/validate-excel.ts`, flags new tests and >20% price changes as warnings, persists every row to `price_list_staging_rows`, sets the version `validated` or `failed`) -> a diff preview (new/newly-priced/changed/unchanged, `lib/excel/detect-changes.ts`) -> confirm & activate. Activation and rollback are Postgres functions (`supabase/migrations/20260901120000_import_pipeline_functions.sql`) called via `supabase.rpc()`, not plain client calls — supabase-js has no multi-statement client transaction, so `activate_price_list_version` (apply staged rows as new current `test_prices`, creating any new test, archiving the previously active version) and `rollback_price_list_version` (re-applies a prior version's rows as a brand-new version, marking the version it replaces `rolled_back` — append-only, nothing rewritten in place) each run as one atomic function body. `/admin/imports` lists history (`ImportsClient`) with a per-row detail drill-down and a rollback action on any archived version. Assumption flagged alongside the rest: the sheet's Price column is a decimal major-unit amount (e.g. 125.50), converted to the location currency's integer minor unit on parse.

   **Verified live** (signed in as `admin@avmlabs.com`, synthetic fixture files) end-to-end for parse -> validate -> stage -> diff -> history, across both a 3-decimal (BHD/Bahrain) and 2-decimal (AED/Dubai) currency: a file with a duplicate test code and a non-numeric price correctly fails validation (2 errors, nothing staged as current data, version status `failed`, diff excludes the error rows); a clean file correctly validates with warnings (new-test flag, a >20%/633% large-price-change flag) and correctly distinguishes "changed" (existing price at this location) from "newly priced" (existing test, no price row yet at this location) in the diff; Import History lists both attempts with correct status/row counts and reconstructs the same per-row error/warning detail from `price_list_staging_rows`; clicking Confirm & activate before the migration below was applied failed exactly as expected ("Could not find the function public.activate_price_list_version...") with no crash and the validated state preserved for retry.

   **Activation and rollback verified live**, after you applied the migration via the Supabase SQL Editor: activating a validated Bahrain/in-house upload created `TEST-999` in the catalog for real (confirmed searchable in the Support Workspace immediately after) and went `active`; a second upload activated as v3 correctly archived v2; rolling back to v2 created v4 as the new active version (restoring v2's exact prices — confirmed CBC back to BHD 55.000, not v3's 60.000) while v3 was correctly marked `rolled_back` (distinct from `archived`) rather than being rewritten in place; the Import History detail dialog correctly reconstructs each attempt's per-row outcome from `price_list_staging_rows`.
7. **Admin: catalog/profile/alias/availability management UI + Excel export** ("download active data as Excel," reusing the exceljs writer). Verify: manual test/alias edits show up immediately in Workspace search; export file matches DB.
8. **Polish & deploy** — loading/empty/error states, Vercel deploy with Supabase prod env vars, full smoke test in production before go-live.

## Setup Needed From You

- ~~A Supabase project and its connection env vars~~ — done. Connected to the `AVMLabs / Chat Web App` project (`jboiysqdtvmtqvufbwlt`), keys in `.env.local` (gitignored), connection verified.
- A Vercel project/account for deployment.
- Confirmation on the Excel schema and the 5 flagged assumptions above.
