# AVM Labs Support Assistant — Build Plan

## Context

AVM Labs needs an internal tool so a 5-person WhatsApp support team can look up diagnostic tests, get the correct location-specific price/TAT/availability, build a quotation, and generate a WhatsApp-ready reply — without manual searching through price sheets, and without pricing mistakes. A separate `/profiles` page lets agents find the right package. An Admin section lets AVM Labs update pricing daily via Excel upload, with no code/AI involvement in the data itself — uploads go through a staging → validate → preview → confirm → activate → archive pipeline so a bad file can never corrupt live pricing, and every activation is a reversible version.

This is a greenfield project (empty directory, no existing code to reuse), so this plan defines the architecture from scratch rather than adapting existing patterns.

**Confirmed decisions (from user):**
- One master test catalog: test code/name is global; each location supplies its own price/TAT/in-house-or-outsourced/availability.
- Auth: Admin gets real login (Supabase Auth, email/password). The 5 agents get a shared access link (no individual accounts) to `/workspace` and `/profiles`.
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
1. **Schema & seed** — all tables above via migrations; seed 4 locations + a handful of sample tests/aliases/prices/profiles for dev. Verify: tables + seed visible in Supabase Studio.
2. **Auth** — Supabase Auth admin login gating `/admin`; shared-link token gating `/workspace` + `/profiles`. Verify: access blocked/allowed correctly in both directions.
3. **Search engine** — `searchTests` server function (alias + trigram ranking). Verify against seeded data incl. the "insulin resistance" example and a deliberate typo.
4. **Support Workspace (single page)** — location switcher, search, result cards (code/name/price/currency/TAT/in-house badge/availability), add-to-quote, running total, profile suggestions from selected tests, "Generate WhatsApp message" (copy-to-clipboard, built only from DB fields). Verify: full manual flow against seed data.
5. **/profiles page** — search by name and by test-name chips, ranked by match count. Verify with a seeded profile against partial test matches.
6. **Admin: Excel import pipeline** — upload → staging → validation report → preview/diff → confirm & activate (transactional) → archive → import history list with rollback. Verify: good file activates correctly; a broken file is rejected with live data untouched; rollback restores prior prices.
7. **Admin: catalog/profile/alias/availability management UI + Excel export** ("download active data as Excel," reusing the exceljs writer). Verify: manual test/alias edits show up immediately in Workspace search; export file matches DB.
8. **Polish & deploy** — loading/empty/error states, Vercel deploy with Supabase prod env vars, full smoke test in production before go-live.

## Setup Needed From You

- A Supabase project (or let me know if you want me to walk you through creating one) and its connection env vars.
- A Vercel project/account for deployment.
- Confirmation on the Excel schema and the 5 flagged assumptions above.
