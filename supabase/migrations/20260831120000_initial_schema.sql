-- AVM Labs Support Assistant — initial schema (Phase 2: Database)
-- See AVM_PLAN.md for the full data model rationale.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_profiles: role for every authenticated user (support or admin).
-- Exact login UX (individual vs shared support credentials) is still being
-- confirmed with the user before Phase 3 — this table works either way.
-- ---------------------------------------------------------------------------
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'support' check (role in ('support', 'admin')),
  created_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- security definer + fixed search_path: safe to call from other tables'
-- RLS policies without recursive-RLS or search-path-hijack risk.
create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from user_profiles where user_id = auth.uid();
$$;

create policy user_profiles_select_own on user_profiles
  for select using (user_id = auth.uid() or current_user_role() = 'admin');
create policy user_profiles_admin_all on user_profiles
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

alter table audit_log enable row level security;
create policy audit_log_admin_select on audit_log
  for select using (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
create table locations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  country text not null,
  currency_code text not null,
  currency_symbol text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger locations_set_updated_at
  before update on locations for each row execute function set_updated_at();

alter table locations enable row level security;
create policy locations_select on locations
  for select using (current_user_role() in ('support', 'admin'));
create policy locations_admin_all on locations
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- tests (master catalog) + aliases + components
-- ---------------------------------------------------------------------------
create table tests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  official_name text not null,
  short_name text,
  category text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tests_set_updated_at
  before update on tests for each row execute function set_updated_at();

create index tests_official_name_trgm_idx on tests using gin (official_name gin_trgm_ops);
create index tests_code_trgm_idx on tests using gin (code gin_trgm_ops);

alter table tests enable row level security;
create policy tests_select on tests
  for select using (current_user_role() in ('support', 'admin'));
create policy tests_admin_all on tests
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table test_aliases (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null check (alias_type in ('customer_term', 'brand_name', 'abbreviation', 'misspelling', 'other')),
  confidence integer not null default 100 check (confidence between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, alias)
);

create trigger test_aliases_set_updated_at
  before update on test_aliases for each row execute function set_updated_at();

create index test_aliases_alias_trgm_idx on test_aliases using gin (alias gin_trgm_ops);
create index test_aliases_normalized_trgm_idx on test_aliases using gin (normalized_alias gin_trgm_ops);
create index test_aliases_test_id_idx on test_aliases (test_id);

alter table test_aliases enable row level security;
create policy test_aliases_select on test_aliases
  for select using (current_user_role() in ('support', 'admin'));
create policy test_aliases_admin_all on test_aliases
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table test_components (
  id uuid primary key default gen_random_uuid(),
  parent_test_id uuid not null references tests(id) on delete cascade,
  component_test_id uuid not null references tests(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint test_components_not_self check (parent_test_id <> component_test_id),
  unique (parent_test_id, component_test_id)
);

create index test_components_parent_id_idx on test_components (parent_test_id);

alter table test_components enable row level security;
create policy test_components_select on test_components
  for select using (current_user_role() in ('support', 'admin'));
create policy test_components_admin_all on test_components
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- price_list_versions + staging (import pipeline)
-- ---------------------------------------------------------------------------
create table price_list_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null,
  location_id uuid not null references locations(id) on delete restrict,
  service_type text not null check (service_type in ('in_house', 'outsource')),
  original_filename text,
  file_storage_path text,
  file_size bigint,
  status text not null default 'staging'
    check (status in ('staging', 'validated', 'approved', 'active', 'archived', 'failed', 'rolled_back')),
  record_count integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  unique (location_id, service_type, version_number)
);

-- Only ONE active version per (location, service_type).
create unique index price_list_versions_one_active_idx
  on price_list_versions (location_id, service_type) where (status = 'active');

alter table price_list_versions enable row level security;
create policy price_list_versions_admin_all on price_list_versions
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table price_list_staging_rows (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references price_list_versions(id) on delete cascade,
  row_number integer,
  raw_row jsonb not null,
  parsed jsonb,
  row_status text not null default 'ok' check (row_status in ('ok', 'error', 'warning')),
  error_messages jsonb,
  created_at timestamptz not null default now()
);

create index price_list_staging_rows_version_id_idx on price_list_staging_rows (version_id);

alter table price_list_staging_rows enable row level security;
create policy price_list_staging_rows_admin_all on price_list_staging_rows
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- test_prices (temporal: current row per test+location+service_type has
-- effective_to = null; a new import closes it out and inserts the new one)
-- ---------------------------------------------------------------------------
create table test_prices (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  service_type text not null check (service_type in ('in_house', 'outsource')),
  price integer not null check (price >= 0), -- integer minor units, see lib/pricing/money.ts
  currency_code text not null,
  tat_text text not null default '',
  availability text not null default 'available'
    check (availability in ('available', 'unavailable', 'temporarily_unavailable')),
  version_id uuid references price_list_versions(id) on delete set null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_prices_effective_range check (effective_to is null or effective_to > effective_from)
);

create trigger test_prices_set_updated_at
  before update on test_prices for each row execute function set_updated_at();

-- At most one "current" (open-ended) price row per test+location+service_type.
create unique index test_prices_current_idx
  on test_prices (test_id, location_id, service_type) where (effective_to is null);

create index test_prices_test_id_idx on test_prices (test_id);
create index test_prices_location_id_idx on test_prices (location_id);
create index test_prices_version_id_idx on test_prices (version_id);

alter table test_prices enable row level security;
create policy test_prices_select on test_prices
  for select using (current_user_role() in ('support', 'admin'));
create policy test_prices_admin_all on test_prices
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- profiles + profile_tests + profile_prices (fixed bundle price, temporal)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles for each row execute function set_updated_at();

create index profiles_name_trgm_idx on profiles using gin (name gin_trgm_ops);
create index profiles_code_trgm_idx on profiles using gin (code gin_trgm_ops);

alter table profiles enable row level security;
create policy profiles_select on profiles
  for select using (current_user_role() in ('support', 'admin'));
create policy profiles_admin_all on profiles
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table profile_tests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  test_id uuid not null references tests(id) on delete cascade,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, test_id)
);

create index profile_tests_profile_id_idx on profile_tests (profile_id);
create index profile_tests_test_id_idx on profile_tests (test_id);

alter table profile_tests enable row level security;
create policy profile_tests_select on profile_tests
  for select using (current_user_role() in ('support', 'admin'));
create policy profile_tests_admin_all on profile_tests
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table profile_prices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  service_type text not null check (service_type in ('in_house', 'outsource')),
  price integer not null check (price >= 0),
  currency_code text not null,
  tat_text text not null default '',
  availability text not null default 'available'
    check (availability in ('available', 'unavailable', 'temporarily_unavailable')),
  version_id uuid references price_list_versions(id) on delete set null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_prices_effective_range check (effective_to is null or effective_to > effective_from)
);

create trigger profile_prices_set_updated_at
  before update on profile_prices for each row execute function set_updated_at();

create unique index profile_prices_current_idx
  on profile_prices (profile_id, location_id, service_type) where (effective_to is null);

create index profile_prices_profile_id_idx on profile_prices (profile_id);
create index profile_prices_location_id_idx on profile_prices (location_id);

alter table profile_prices enable row level security;
create policy profile_prices_select on profile_prices
  for select using (current_user_role() in ('support', 'admin'));
create policy profile_prices_admin_all on profile_prices
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- All app data access currently goes through the service-role key
-- server-side (see lib/supabase/admin.ts), which bypasses RLS entirely, so
-- the browser never has a direct path to this data. The policies above are
-- defense-in-depth and are what would apply if support/admin sessions ever
-- query Supabase directly from an authenticated browser session.
