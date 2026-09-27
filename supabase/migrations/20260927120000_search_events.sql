-- Search learning, step 1: log the Support Workspace search box's outcomes
-- so admins can see what agents search for and fail to find.
--
-- One row per *finished* search, never per keystroke (the browser decides
-- when a search is finished — components/workspace/use-search-telemetry.ts):
--   - a pick: the agent added a test from the results (picked_test_id set,
--     picked_rank = its 1-based position among the rule-based results, or
--     null when it came from the AI fallback list instead);
--   - a miss: the search settled on zero rule-based results and was then
--     abandoned (picked_test_id null, result_count 0).
-- previous_miss_query links a pick back to the zero-result search the agent
-- made just before it in the same browser ("sugar fasting" -> retyped "FBS"
-- -> picked FBS), which becomes the suggested alias on the admin page.
--
-- Apply via the Supabase SQL Editor (same as the earlier migrations).

create table search_events (
  id uuid primary key default gen_random_uuid(),
  query text not null check (char_length(query) between 1 and 100),
  normalized_query text not null,
  location_id uuid references locations(id) on delete set null,
  result_count integer not null check (result_count >= 0),
  picked_test_id uuid references tests(id) on delete set null,
  picked_rank integer check (picked_rank >= 1),
  previous_miss_query text,
  created_at timestamptz not null default now()
);

create index search_events_normalized_query_idx on search_events (normalized_query);
create index search_events_created_at_idx on search_events (created_at);
create index search_events_picked_test_id_idx on search_events (picked_test_id);

alter table search_events enable row level security;
-- Agents only ever write their own events; reading and pruning the log is admin-only.
create policy search_events_insert on search_events
  for insert with check (current_user_role() in ('support', 'admin'));
create policy search_events_admin_select on search_events
  for select using (current_user_role() = 'admin');
create policy search_events_admin_delete on search_events
  for delete using (current_user_role() = 'admin');
