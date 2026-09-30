-- Wipe all catalog/pricing data ahead of loading a new master.
--
-- DELETES (permanently, no undo):
--   tests, test_aliases, test_components, test_prices,
--   profiles, profile_tests, profile_prices,
--   price_list_versions, price_list_staging_rows,
--   search_events, audit_log, app_events
--
-- KEEPS: locations, user_profiles, auth users (logins), schema, functions, RLS.
--
-- No CASCADE on purpose: every table that references a wiped table is listed,
-- so if a table is ever added that references one of these, this fails loudly
-- instead of silently emptying it too.
--
-- Run in the Supabase SQL Editor. Take a backup first if there is any chance
-- you will want the old data back.

begin;

truncate table
  profile_prices,
  profile_tests,
  profiles,
  test_prices,
  test_components,
  test_aliases,
  search_events,
  price_list_staging_rows,
  price_list_versions,
  tests,
  audit_log,
  app_events;

-- Every wiped table should show 0; locations and user_profiles should be unchanged.
select 'tests' as table_name, count(*) from tests
union all select 'test_aliases', count(*) from test_aliases
union all select 'test_components', count(*) from test_components
union all select 'test_prices', count(*) from test_prices
union all select 'profiles', count(*) from profiles
union all select 'profile_tests', count(*) from profile_tests
union all select 'profile_prices', count(*) from profile_prices
union all select 'price_list_versions', count(*) from price_list_versions
union all select 'price_list_staging_rows', count(*) from price_list_staging_rows
union all select 'search_events', count(*) from search_events
union all select 'audit_log', count(*) from audit_log
union all select 'app_events', count(*) from app_events
union all select 'locations (kept)', count(*) from locations
union all select 'user_profiles (kept)', count(*) from user_profiles;

commit;
