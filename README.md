# AVM Support

Internal tool for the AVM Labs WhatsApp support team: search diagnostic tests, get
location-specific pricing/TAT/availability, build a quotation, and generate a
WhatsApp-ready reply — plus an Admin section for safely updating pricing via Excel.

See `AVM_PLAN.md` for the full architecture, data model, and phased build plan.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres + Auth) · exceljs · Zod

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + keys
npm run dev
```

## Structure

Code is grouped by feature. `app/` holds routes only; the UI lives in `components/`,
and all logic and data access live in `lib/`.

```
app/                         # routes only: pages, layouts, API route handlers
  (auth)/login/              # sign-in page (brand panel + form)
  (dashboard)/               # signed-in shell: header, location picker, quote state
    workspace/               # Quote Builder, the agents' main screen
    profiles/                # Packages search
    updates/                 # recent price/availability changes
    admin/                   # upload, tests, aliases, packages, missed searches,
                             # export, imports, system health
    dashboard/               # redirects to /workspace
  api/                       # route handlers (search, profiles, imports, exports, admin, AI)

components/                  # React UI, one folder per section
  layout/                    # app header, theme, shared page chrome
  workspace/                 # Quote Builder
    workspace-client.tsx     #   the screen itself: wires everything below together
    search/                  #   search box, results rows, filters, telemetry, in-browser AI
    paste/                   #   "Paste text or image" reader
    assistant/               #   Support Assistant
    quote/                   #   quotation panel, quote state, package suggestions
  profiles/                  # Packages page
  admin/                     # one subfolder per admin page
  ui/                        # shadcn/ui primitives (don't edit by hand)

lib/                         # logic and data access, no React
  search/
    matching/                # the fuzzy matcher: normalize, typo scoring, synonyms, ranking
    catalog/                 # searching tests: server search, in-browser catalog, browse lists
    reading/                 # reading pasted messages/lists into tests (rules + Gemini)
    semantic/                # in-browser AI similarity (MiniLM web worker)
    learning/                # turning the search log into Admin > Missed searches
  ai/                        # shared Gemini client (4 free keys, fallbacks, error logging)
  ai-assistant/              # Support Assistant answers
  database/                  # every Supabase query: *Row type -> map*() -> domain type
  supabase/                  # Supabase clients (admin = data, server = auth, middleware = proxy)
  auth/                      # requireUser / requireAdmin
  profiles/                  # package matching and pricing
  pricing/                   # integer money maths and discount tiers
  excel/  imports/           # Excel upload pipeline: parse, validate, diff, commit, rollback
  whatsapp/                  # WhatsApp reply text
  validation/                # zod schemas for API input
  constants/  utils/         # shared constants and small helpers

types/                       # domain types shared by lib/ and components/
proxy.ts                     # route protection (Next 16's name for middleware)
supabase/migrations/         # SQL schema, applied in filename order
supabase/seed/seed.sql       # dummy seed data, never real pricing
scripts.local/               # git-ignored one-off maintenance scripts
```

### Where new files go

- **A new page:** the route in `app/`, its UI in `components/<section>/`.
- **A new query:** `lib/database/<table>.ts`, following the `*Row` → `map*()` pattern.
- **Search logic:** `lib/search/<stage>/`. Keep it pure (no DB, no React), so it runs both in the browser and on the server.
- **A Quote Builder piece:** the matching `components/workspace/<area>/` folder. A component used by several areas (like `availability-pill.tsx`) stays in `components/workspace/`.
- **One-off data scripts:** `scripts.local/`. It's git-ignored and skipped by lint and type-check.
- **Imports:** use the `@/` alias across folders, and `./` only inside the same folder.

## Status

Phases 0–7 complete; Phase 8 (polish) done bar the Vercel deploy. See `AVM_PLAN.md` for the
authoritative phase-by-phase log — it's more current than this file. No business data (test
names, prices, aliases) is hardcoded anywhere — the database is the sole source of truth.
