# AVM Labs Support Assistant

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

```
app/
  (auth)/login/            # admin sign-in (static placeholder)
  (dashboard)/             # authenticated shell: sidebar + topbar
    dashboard/             # TODO: purpose not yet defined
    workspace/              # Support Workspace — single-page search + quotation (Phase 4)
    profiles/               # Profile/package search (Phase 5)
    updates/                 # TODO: purpose not yet defined
    admin/                  # Excel import pipeline + catalog/alias/profile management (Phases 6-7)
  api/                     # route handlers backing search/quotation/profiles/imports/exports

components/
  layout/                  # Sidebar (real nav), Topbar, location/service-type selectors
  workspace/ profiles/ admin/  # UI pieces per section (placeholders until their phase)
  ui/                      # shadcn/ui primitives

lib/
  supabase/                # client.ts (browser), server.ts (auth session), admin.ts
                            # (service-role — all data access), middleware.ts
  constants/                # LocationCode, ServiceType, AvailabilityStatus — single source
                            # of truth for these unions; actual records still come from the DB
  pricing/money.ts          # safe integer minor-unit arithmetic — no floating point
  profiles/calculate-profile-match.ts  # profile-ranking algorithm (implemented, pure)
  search/ excel/ imports/ whatsapp/ database/ validation/  # placeholders pending their phase

types/                     # domain types mirroring the DB schema (Test, TestPrice, Profile, ...)
supabase/migrations/       # SQL schema (Phase 1)
supabase/seed/seed.sql     # dev seed data (Phase 1) — never production pricing data
tests/{unit,integration,fixtures}/
```

## Status

Phase 0 (scaffold + full folder structure) complete. See `AVM_PLAN.md` for phase-by-phase
progress. No business data (test names, prices, aliases) is hardcoded anywhere — the
database is the sole source of truth once Phase 1 (schema + seed) lands.
