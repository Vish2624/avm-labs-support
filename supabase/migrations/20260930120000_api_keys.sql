-- API usage monitoring (Admin > API usage).
--
-- api_keys: every Gemini key the app can use — the ones set as Vercel
-- environment variables (env_name set, api_key null: the secret stays in
-- Vercel) and the ones an admin adds on the page (api_key set). role is the
-- feature a key serves first; "shared" keys serve any feature before it
-- borrows another feature's key, and "backup" keys are the last resort
-- (lib/ai/gemini.ts). daily_limit is the admin's note of the key's
-- requests-per-day quota — Google doesn't report what's left, so the page
-- compares it with the calls counted in api_calls.
--
-- api_calls: one row per request sent to Gemini (success or not), with how
-- long it took — what the page's daily counts, success rates and response
-- times are built from. Pruned after 30 days when the page is opened.
--
-- Apply via the Supabase SQL Editor (same as the earlier migrations). Safe to
-- run more than once.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 60),
  role text not null check (role in ('reader', 'image', 'search', 'assistant', 'shared', 'backup')),
  env_name text unique check (env_name ~ '^[A-Z0-9_]{1,80}$'),
  api_key text unique check (char_length(api_key) between 10 and 200),
  daily_limit integer check (daily_limit > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((env_name is null) <> (api_key is null))
);

create table if not exists api_calls (
  id bigint generated always as identity primary key,
  key_id uuid references api_keys(id) on delete set null,
  feature text not null check (char_length(feature) between 1 and 40),
  model text not null check (char_length(model) between 1 and 80),
  outcome text not null check (outcome in ('ok', 'quota', 'error', 'timeout', 'network', 'empty', 'cancelled')),
  http_status integer,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists api_calls_created_at_idx on api_calls (created_at);
create index if not exists api_calls_key_created_idx on api_calls (key_id, created_at);

-- Written and read only by the server (service role, which bypasses RLS).
-- api_keys holds secrets, so it has no policies at all: nobody reads it
-- through the anon key, admin or not.
alter table api_keys enable row level security;
alter table api_calls enable row level security;
drop policy if exists api_calls_admin_select on api_calls;
create policy api_calls_admin_select on api_calls
  for select using (current_user_role() = 'admin');
