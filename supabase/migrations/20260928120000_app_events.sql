-- System health log: problems the app hits while serving agents, so admins
-- can see them on Admin > System health instead of the app failing quietly.
--
-- One row per problem, written server-side only (service-role client, see
-- lib/database/app-events.ts) — e.g. a Gemini request that failed, timed
-- out or hit its daily quota; a feature that fell back to the basic reader;
-- a search catalog that couldn't load. `feature` is the part of the app
-- (paste, image, search, assistant, catalog…), `key_role` the Gemini key
-- involved (reader/image/search/assistant), `detail` a short technical
-- note (model, HTTP status). Never customer text.
--
-- Apply via the Supabase SQL Editor (same as the earlier migrations).

create table app_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gemini_error', 'gemini_timeout', 'gemini_quota', 'gemini_unavailable', 'fallback', 'error')),
  feature text not null check (char_length(feature) between 1 and 40),
  key_role text check (key_role in ('reader', 'image', 'search', 'assistant')),
  message text not null check (char_length(message) between 1 and 300),
  detail text check (char_length(detail) <= 300),
  created_at timestamptz not null default now()
);

create index app_events_created_at_idx on app_events (created_at);
create index app_events_kind_idx on app_events (kind);

alter table app_events enable row level security;
-- Written only by the server (service role, which bypasses RLS); reading
-- and pruning the log is admin-only.
create policy app_events_admin_select on app_events
  for select using (current_user_role() = 'admin');
create policy app_events_admin_delete on app_events
  for delete using (current_user_role() = 'admin');
