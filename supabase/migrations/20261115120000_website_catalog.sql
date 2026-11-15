-- The website is the only source of the catalogue. The website admin's "Push to support" sends the whole catalogue
-- (tests, profiles, special profiles, prices, report times, Live/Hidden) and apply_website_catalog() writes it into
-- the tables the app already reads (tests, test_prices, test_aliases, profiles, profile_tests, profile_prices), so
-- search, the AI assistant and the quotation keep working unchanged.
--
-- Mapping:
--   website country -> location:  AE -> DUB, SA -> RUH and KHO (same price), BH -> BAH
--   regular tests and profiles     -> service_type 'in_house'
--   CRL tests and special profiles -> service_type 'outsource' (shown as "Special" in the app)
--   Live on the website            -> active; hidden -> inactive; deleted on the website -> deleted here
--   everything else the website knows (fasting, sample, parameters, categories, Recommended…) -> details (jsonb)
--
-- Aliases: on every push the website's own other names (a test's "also known as" names, lab code and lab short name)
-- become aliases first (source 'website'), then the team's old aliases kept in legacy_aliases are linked to the
-- website test they certainly belong to (same lab code, else the same name; source 'legacy'). Aliases the team adds
-- later (source null) are never touched by a push.
--
-- After this migration, once: back up, run supabase/scripts/switch_to_website_catalog.sql (keeps the old aliases,
-- removes the old catalogue), set the push secret with set_website_push_secret(), then push from the website admin.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Where each row came from on the website, and what else it knows about it.
-- ---------------------------------------------------------------------------
alter table tests add column if not exists website_id text unique;
alter table tests add column if not exists details jsonb not null default '{}';

alter table profiles add column if not exists website_kind text check (website_kind in ('profile', 'special'));
alter table profiles add column if not exists website_id text;
alter table profiles add column if not exists details jsonb not null default '{}';
alter table profiles drop constraint if exists profiles_website_key;
alter table profiles add constraint profiles_website_key unique (website_kind, website_id);

alter table test_aliases add column if not exists source text check (source in ('website', 'legacy'));

-- ---------------------------------------------------------------------------
-- The team's aliases from the old catalogue, kept by the old test's code and name so each can be linked to the
-- website test it belongs to. linked_test_id: the test it was linked to, or null while no certain match exists.
-- ---------------------------------------------------------------------------
create table if not exists legacy_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_type text not null,
  confidence integer not null default 100,
  active boolean not null default true,
  old_code text not null,
  old_name text not null,
  linked_test_id uuid references tests(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (alias, old_code)
);

alter table legacy_aliases enable row level security;
drop policy if exists legacy_aliases_admin_select on legacy_aliases;
create policy legacy_aliases_admin_select on legacy_aliases
  for select using (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- The push: one row. secret_hash: bcrypt of the website's push secret. fingerprints: each item's fingerprint from
-- the last push, so the website admin can say what hasn't been pushed. snapshot: the last push as sent.
-- No policies: only the functions below (security definer) read or write it.
-- ---------------------------------------------------------------------------
create table if not exists website_sync (
  id smallint primary key default 1 check (id = 1),
  secret_hash text,
  version integer not null default 0,
  pushed_at timestamptz,
  fingerprints jsonb,
  snapshot jsonb,
  counts jsonb,
  -- Each website country's minimum billing and free home collection limit, for the profile suggestions.
  rules jsonb
);

alter table website_sync add column if not exists rules jsonb;

alter table website_sync enable row level security;
revoke all on website_sync from anon, authenticated;
insert into website_sync (id) values (1) on conflict (id) do nothing;

-- Run once in the SQL Editor with the same value as the website's SUPPORT_PUSH_SECRET (at least 32 characters).
create or replace function set_website_push_secret(new_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if length(coalesce(new_secret, '')) < 32 then
    raise exception 'The push secret must be at least 32 characters';
  end if;
  update website_sync set secret_hash = crypt(new_secret, gen_salt('bf')) where id = 1;
end;
$$;

revoke all on function set_website_push_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Same as normalizeQuery() in lib/search/matching/normalize-query.ts, so aliases written here match the app's search.
-- ---------------------------------------------------------------------------
create or replace function normalize_alias(raw text)
returns text
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(lower(unaccent(coalesce(raw, ''))), '[^a-z0-9\s]', ' ', 'g'),
      'anaem', 'anem'), 'haem', 'hem'), 'aemia', 'emia'), 'oestr', 'estr'),
      'oedem', 'edem'), 'faec', 'fec'), 'paed', 'ped'), 'tumour', 'tumor'),
    '\s+', ' ', 'g'))
$$;

create or replace function check_website_push_secret(secret text)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  select secret_hash into v_hash from website_sync where id = 1;
  if v_hash is null then
    raise exception 'The push secret isn''t set in the support app yet (set_website_push_secret)';
  end if;
  if secret is null or crypt(secret, v_hash) <> v_hash then
    raise exception 'Wrong push secret' using errcode = '28000';
  end if;
end;
$$;

revoke all on function check_website_push_secret(text) from public, anon, authenticated;

-- The last push, for the website admin's "Last pushed … · N changes not pushed".
create or replace function website_catalog_status(secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform check_website_push_secret(secret);
  return (select jsonb_build_object('version', version, 'pushed_at', pushed_at, 'fingerprints', fingerprints)
          from website_sync where id = 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_website_catalog: writes a push. One function body is one transaction: any error undoes all of it, and the
-- app keeps its last good copy. Only rows that changed are written.
-- ---------------------------------------------------------------------------
create or replace function apply_website_catalog(secret text, snapshot jsonb, fingerprints jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_version integer;
  v_counts jsonb;
begin
  perform check_website_push_secret(secret);
  -- One push at a time.
  perform 1 from website_sync where id = 1 for update;

  if (snapshot->>'format') is distinct from '1' then
    raise exception 'The support app doesn''t know this catalogue format (%)', snapshot->>'format';
  end if;
  if jsonb_array_length(coalesce(snapshot->'tests', '[]')) = 0
     or jsonb_array_length(coalesce(snapshot->'profiles', '[]')) = 0 then
    raise exception 'The catalogue is empty';
  end if;
  if exists (select 1 from tests where website_id is null) or exists (select 1 from profiles where website_id is null) then
    raise exception 'The old catalogue is still in the support app: run supabase/scripts/switch_to_website_catalog.sql first';
  end if;

  -- Where each country's prices go, and the currency's minor unit (lib/pricing/money.ts: BHD 3 decimals, else 2).
  create temp table w_loc on commit drop as
    select l.id as location_id, m.country, l.currency_code,
           case l.currency_code when 'BHD' then 1000 else 100 end as unit
    from (values ('AE', 'DUB'), ('SA', 'RUH'), ('SA', 'KHO'), ('BH', 'BAH')) as m(country, code)
    join locations l on l.code = m.code;

  -- Tests. The code shown is the lab's code when it has a unique one, else the website id.
  create temp table w_tests on commit drop as
    select x.wid, x.j,
           case when x.lab_code is not null and count(*) over (partition by upper(x.lab_code)) = 1
                then x.lab_code else x.wid end as code,
           (select c->>'label' from jsonb_array_elements(snapshot->'categories'->'tests') c
            where c->>'id' = x.j->'categories'->>0) as category
    from (select t->>'id' as wid, t as j, nullif(btrim(t->>'code'), '') as lab_code
          from jsonb_array_elements(snapshot->'tests') t) x;

  delete from tests where website_id is not null and website_id not in (select wid from w_tests);

  insert into tests (website_id, code, official_name, short_name, category, description, active, details)
  select wid, code, j->>'name', nullif(j->>'short', ''), category, nullif(j->>'about', ''), (j->>'live')::boolean,
         j - array['id', 'name', 'short', 'about', 'live']
  from w_tests
  on conflict (website_id) do update set
    code = excluded.code, official_name = excluded.official_name, short_name = excluded.short_name,
    category = excluded.category, description = excluded.description, active = excluded.active,
    details = excluded.details
  where (tests.code, tests.official_name, tests.short_name, tests.category, tests.description, tests.active, tests.details)
    is distinct from
        (excluded.code, excluded.official_name, excluded.short_name, excluded.category, excluded.description,
         excluded.active, excluded.details);

  -- Test prices: one current row per test, location and service type.
  create temp table w_tprice on commit drop as
    select te.id as test_id, l.location_id,
           case when (w.j->>'crl')::boolean then 'outsource' else 'in_house' end as service_type,
           round((w.j->'prices'->>l.country)::numeric * l.unit)::integer as price,
           l.currency_code, coalesce(w.j->'tats'->>l.country, '') as tat
    from w_tests w
    join tests te on te.website_id = w.wid
    cross join w_loc l
    where coalesce((w.j->'prices'->>l.country)::numeric, 0) > 0;

  delete from test_prices p
  where p.effective_to is not null
     or not exists (select 1 from w_tprice x
                    where x.test_id = p.test_id and x.location_id = p.location_id and x.service_type = p.service_type);

  update test_prices p
  set price = x.price, currency_code = x.currency_code, tat_text = x.tat, availability = 'available'
  from w_tprice x
  where x.test_id = p.test_id and x.location_id = p.location_id and x.service_type = p.service_type
    and (p.price, p.currency_code, p.tat_text, p.availability) is distinct from (x.price, x.currency_code, x.tat, 'available');

  insert into test_prices (test_id, location_id, service_type, price, currency_code, tat_text)
  select x.test_id, x.location_id, x.service_type, x.price, x.currency_code, x.tat
  from w_tprice x
  where not exists (select 1 from test_prices p
                    where p.test_id = x.test_id and p.location_id = x.location_id and p.service_type = x.service_type);

  -- Profiles and special profiles. A profile shows the lab's code when it has a unique one, else its website id; a
  -- special profile shows special-<id>.
  create temp table w_prof on commit drop as
    select x.kind, x.wid, x.j,
           case when x.kind = 'special' then 'special-' || x.wid
                when x.lab_code is not null and count(*) over (partition by x.kind, upper(x.lab_code)) = 1 then x.lab_code
                else x.wid end as code
    from (select 'profile'::text as kind, p->>'id' as wid, p as j, nullif(btrim(p->>'code'), '') as lab_code
          from jsonb_array_elements(snapshot->'profiles') p
          union all
          select 'special', s->>'id', s, null
          from jsonb_array_elements(coalesce(snapshot->'specials', '[]')) s) x;

  delete from profiles pr
  where pr.website_id is not null
    and not exists (select 1 from w_prof w where w.kind = pr.website_kind and w.wid = pr.website_id);

  insert into profiles (website_kind, website_id, code, name, description, active, details)
  select kind, wid, code, j->>'name', nullif(j->>'tagline', ''), (j->>'live')::boolean,
         j - array['id', 'name', 'tagline', 'live']
  from w_prof
  on conflict (website_kind, website_id) do update set
    code = excluded.code, name = excluded.name, description = excluded.description, active = excluded.active,
    details = excluded.details
  where (profiles.code, profiles.name, profiles.description, profiles.active, profiles.details)
    is distinct from (excluded.code, excluded.name, excluded.description, excluded.active, excluded.details);

  -- A profile's tests: every test it has, its included profiles' too. A special profile's tests are names typed on
  -- the website: each is linked to the one test with that name, lab code or short name, if exactly one has it.
  create temp table w_ptests on commit drop as
    select distinct pr.id as profile_id, te.id as test_id
    from w_prof w
    join profiles pr on pr.website_kind = w.kind and pr.website_id = w.wid
    cross join lateral jsonb_array_elements_text(w.j->'tests') as tid
    join tests te on te.website_id = tid
    where w.kind = 'profile';

  insert into w_ptests (profile_id, test_id)
  with names as (
    select te.id, normalize_alias(n) as n
    from tests te
    cross join lateral unnest(array[te.official_name, te.short_name, te.details->>'code']) as n
    where coalesce(n, '') <> ''
  ),
  unique_names as (
    select n, (array_agg(distinct id))[1] as test_id from names group by n having count(distinct id) = 1
  ),
  items as (
    select pr.id as profile_id, normalize_alias(item) as n
    from w_prof w
    join profiles pr on pr.website_kind = w.kind and pr.website_id = w.wid
    cross join lateral jsonb_array_elements(w.j->'groups') as g
    cross join lateral jsonb_array_elements_text(g->'items') as item
    where w.kind = 'special'
  )
  select distinct i.profile_id, u.test_id from items i join unique_names u on u.n = i.n;

  delete from profile_tests pt
  using profiles pr
  where pt.profile_id = pr.id and pr.website_id is not null
    and not exists (select 1 from w_ptests x where x.profile_id = pt.profile_id and x.test_id = pt.test_id);

  insert into profile_tests (profile_id, test_id)
  select profile_id, test_id from w_ptests
  on conflict (profile_id, test_id) do nothing;

  -- Profile prices, like test prices; report times are the website's (a profile's longest test, 7 days for special).
  create temp table w_pprice on commit drop as
    select pr.id as profile_id, l.location_id,
           case when w.kind = 'special' then 'outsource' else 'in_house' end as service_type,
           round((w.j->'prices'->>l.country)::numeric * l.unit)::integer as price,
           l.currency_code, coalesce(w.j->'tats'->>l.country, '') as tat
    from w_prof w
    join profiles pr on pr.website_kind = w.kind and pr.website_id = w.wid
    cross join w_loc l
    where coalesce((w.j->'prices'->>l.country)::numeric, 0) > 0;

  delete from profile_prices p
  where p.effective_to is not null
     or not exists (select 1 from w_pprice x
                    where x.profile_id = p.profile_id and x.location_id = p.location_id
                      and x.service_type = p.service_type);

  update profile_prices p
  set price = x.price, currency_code = x.currency_code, tat_text = x.tat, availability = 'available'
  from w_pprice x
  where x.profile_id = p.profile_id and x.location_id = p.location_id and x.service_type = p.service_type
    and (p.price, p.currency_code, p.tat_text, p.availability) is distinct from (x.price, x.currency_code, x.tat, 'available');

  insert into profile_prices (profile_id, location_id, service_type, price, currency_code, tat_text)
  select x.profile_id, x.location_id, x.service_type, x.price, x.currency_code, x.tat
  from w_pprice x
  where not exists (select 1 from profile_prices p
                    where p.profile_id = x.profile_id and p.location_id = x.location_id
                      and p.service_type = x.service_type);

  -- The website's own other names for each test, first: "also known as" names, the lab code and lab short name,
  -- unless they're just the name, short name or code the search already matches.
  create temp table w_alias on commit drop as
    select distinct on (te.id, a.alias) te.id as test_id, a.alias, a.alias_type
    from w_tests w
    join tests te on te.website_id = w.wid
    cross join lateral (
      select btrim(x) as alias, 'other' as alias_type, 1 as pick
      from unnest(string_to_array(coalesce(w.j->>'aka', ''), ',')) as x
      union all select btrim(coalesce(w.j->>'code', '')), 'abbreviation', 2
      union all select btrim(coalesce(w.j->>'shortName', '')), 'abbreviation', 3
    ) a
    where normalize_alias(a.alias) <> ''
      and normalize_alias(a.alias) not in (normalize_alias(te.official_name), normalize_alias(te.short_name),
                                           normalize_alias(te.code))
    order by te.id, a.alias, a.pick;

  delete from test_aliases ta
  where ta.source = 'website'
    and not exists (select 1 from w_alias x where x.test_id = ta.test_id and x.alias = ta.alias);

  insert into test_aliases (test_id, alias, normalized_alias, alias_type, confidence, active, source)
  select test_id, alias, normalize_alias(alias), alias_type, 100, true, 'website' from w_alias
  on conflict (test_id, alias) do nothing;

  -- Then the team's old aliases: each linked to the test with the same lab code, else the same name, only when
  -- exactly one test matches. The rest wait, unlinked, for a test that matches in a later push.
  with by_code as (
    select la.id, (array_agg(distinct te.id))[1] as test_id
    from legacy_aliases la
    join tests te on upper(nullif(btrim(te.details->>'code'), '')) = upper(btrim(la.old_code))
    where la.linked_test_id is null
    group by la.id
    having count(distinct te.id) = 1
  ),
  by_name as (
    select la.id, (array_agg(distinct te.id))[1] as test_id
    from legacy_aliases la
    join tests te on normalize_alias(la.old_name) in (normalize_alias(te.official_name), normalize_alias(te.short_name))
    where la.linked_test_id is null and normalize_alias(la.old_name) <> ''
      and la.id not in (select id from by_code)
    group by la.id
    having count(distinct te.id) = 1
  ),
  matched as (select * from by_code union all select * from by_name)
  update legacy_aliases la set linked_test_id = m.test_id from matched m where la.id = m.id;

  insert into test_aliases (test_id, alias, normalized_alias, alias_type, confidence, active, source)
  select la.linked_test_id, la.alias, normalize_alias(la.alias), la.alias_type, la.confidence, la.active, 'legacy'
  from legacy_aliases la
  where la.linked_test_id is not null
  on conflict (test_id, alias) do nothing;

  v_counts := jsonb_build_object(
    'tests', (select count(*) from w_tests),
    'profiles', (select count(*) from w_prof where kind = 'profile'),
    'specials', (select count(*) from w_prof where kind = 'special'),
    'legacyAliasesLinked', (select count(*) from legacy_aliases where linked_test_id is not null),
    'legacyAliasesUnlinked', (select count(*) from legacy_aliases where linked_test_id is null)
  );

  update website_sync
  set version = version + 1, pushed_at = now(), fingerprints = apply_website_catalog.fingerprints,
      snapshot = apply_website_catalog.snapshot, counts = v_counts,
      rules = apply_website_catalog.snapshot->'regions'
  where id = 1
  returning version into v_version;

  insert into audit_log (action, entity, new_value)
  values ('website_push', 'catalog', v_counts || jsonb_build_object('version', v_version));

  return jsonb_build_object('version', v_version, 'pushed_at', now(), 'counts', v_counts);
end;
$$;

-- Open to the website through the public (anon) key: both check the push secret before anything else.
revoke all on function website_catalog_status(text) from public;
revoke all on function apply_website_catalog(text, jsonb, jsonb) from public;
grant execute on function website_catalog_status(text) to anon, authenticated, service_role;
grant execute on function apply_website_catalog(text, jsonb, jsonb) to anon, authenticated, service_role;
