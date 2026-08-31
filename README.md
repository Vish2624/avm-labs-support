# AVM Labs Support Assistant

Internal tool for the AVM Labs WhatsApp support team: search diagnostic tests, get
location-specific pricing/TAT/availability, build a quotation, and generate a
WhatsApp-ready reply — plus an Admin section for safely updating pricing via Excel.

See `AVM_PLAN.md` for the full architecture and phased build plan.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Postgres + Auth) · exceljs

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + keys
npm run dev
```

## Structure

- `src/app/workspace` — Support Workspace (single-page search + quotation)
- `src/app/profiles` — Profile/package search
- `src/app/admin` — Admin (Excel import pipeline, catalog/alias/profile management)
- `src/lib/supabase` — Supabase clients (`service.ts` = service-role, all data access;
  `server.ts` = cookie-aware, admin auth session only)
- `src/lib/db`, `src/lib/search`, `src/lib/excel` — data access, search ranking, Excel
  parse/validate/export logic
- `supabase/migrations` — SQL schema migrations

## Status

Phase 0 (scaffold) complete. See `AVM_PLAN.md` for phase-by-phase progress.
