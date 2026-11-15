-- Switch to the website's catalogue (migration 20261115120000_website_catalog.sql). Run ONCE in the Supabase SQL
-- Editor, after taking a backup and before the first push from the website admin.
--
-- 1. Keeps every alias the team made on the old tests in legacy_aliases, with the old test's code and name. Each push
--    then links them to the matching website test (same lab code, else the same name; only certain matches).
-- 2. Removes the old catalogue: tests, aliases, prices, profiles and the Excel import history. Every push afterwards
--    fills these from the website.
--
-- KEEPS: locations, logins and roles, search_events (missed searches; their picked test is cleared), app_events,
-- audit_log, API keys.

begin;

insert into legacy_aliases (alias, alias_type, confidence, active, old_code, old_name)
select a.alias, a.alias_type, a.confidence, a.active, t.code, t.official_name
from test_aliases a
join tests t on t.id = a.test_id
where t.website_id is null
on conflict (alias, old_code) do nothing;

delete from profile_prices where profile_id in (select id from profiles where website_id is null);
delete from profile_tests where profile_id in (select id from profiles where website_id is null);
delete from profiles where website_id is null;
delete from test_prices where test_id in (select id from tests where website_id is null);
delete from test_components where parent_test_id in (select id from tests where website_id is null)
                               or component_test_id in (select id from tests where website_id is null);
delete from test_aliases where test_id in (select id from tests where website_id is null);
delete from tests where website_id is null;
delete from price_list_staging_rows;
delete from price_list_versions;

-- legacy_aliases should hold the old aliases; the old catalogue tables should show 0.
select 'legacy_aliases (kept)' as table_name, count(*) from legacy_aliases
union all select 'old tests left', count(*) from tests where website_id is null
union all select 'old profiles left', count(*) from profiles where website_id is null
union all select 'price_list_versions', count(*) from price_list_versions
union all select 'locations (kept)', count(*) from locations;

commit;
