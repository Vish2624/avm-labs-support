-- AVM Labs Support Assistant — import pipeline activation/rollback (Phase 6)
-- See AVM_PLAN.md's "Validation Rules" section for the rationale.
--
-- supabase-js has no way to run multiple statements in one client-side
-- transaction, so the two operations that must be atomic — activating a
-- validated import, and rolling back to a prior one — are implemented as
-- plpgsql functions instead. A Postgres function body is one implicit
-- transaction: any exception raised inside rolls back everything it did,
-- and the client only ever sees "it worked" or "it didn't" (see
-- lib/database/imports.ts, which calls these via supabase.rpc()).

-- ---------------------------------------------------------------------------
-- activate_price_list_version: applies a 'validated' version's staged rows
-- as the new current test_prices (creating any new tests along the way),
-- archives the previously active version for the same
-- (location, service_type), and records an audit_log entry.
-- ---------------------------------------------------------------------------
create or replace function activate_price_list_version(p_version_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version price_list_versions%rowtype;
  v_location locations%rowtype;
  v_row price_list_staging_rows%rowtype;
  v_test_id uuid;
  v_applied_count integer := 0;
begin
  select * into v_version from price_list_versions where id = p_version_id for update;
  if not found then
    raise exception 'Import version % not found', p_version_id;
  end if;
  if v_version.status <> 'validated' then
    raise exception 'Import version % must be "validated" to activate (is "%")', p_version_id, v_version.status;
  end if;

  select * into v_location from locations where id = v_version.location_id;
  if not found then
    raise exception 'Location % not found', v_version.location_id;
  end if;

  for v_row in
    select * from price_list_staging_rows
    where version_id = p_version_id and row_status <> 'error'
    order by row_number
  loop
    -- Match the catalog case-insensitively (a NEW test is inserted using
    -- the file's own casing); never overwrite an existing test's curated
    -- official_name/category from the file.
    select id into v_test_id from tests where upper(code) = upper(v_row.parsed->>'testCode');

    if v_test_id is null then
      insert into tests (code, official_name, category, active)
      values (v_row.parsed->>'testCode', v_row.parsed->>'testName', v_row.parsed->>'category', true)
      returning id into v_test_id;
    end if;

    update test_prices
      set effective_to = now()
      where test_id = v_test_id
        and location_id = v_version.location_id
        and service_type = v_version.service_type
        and effective_to is null;

    insert into test_prices (
      test_id, location_id, service_type, price, currency_code, tat_text, availability, version_id, effective_from
    ) values (
      v_test_id,
      v_version.location_id,
      v_version.service_type,
      (v_row.parsed->>'price')::integer,
      v_location.currency_code,
      v_row.parsed->>'tatText',
      v_row.parsed->>'availability',
      p_version_id,
      now()
    );

    v_applied_count := v_applied_count + 1;
  end loop;

  update price_list_versions
    set status = 'archived'
    where location_id = v_version.location_id
      and service_type = v_version.service_type
      and status = 'active'
      and id <> p_version_id;

  update price_list_versions
    set status = 'active', activated_at = now(), record_count = v_applied_count
    where id = p_version_id;

  insert into audit_log (user_id, action, entity, entity_id, new_value)
  values (
    p_user_id,
    'activate_import',
    'price_list_versions',
    p_version_id,
    jsonb_build_object('recordCount', v_applied_count, 'versionNumber', v_version.version_number)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- rollback_price_list_version: restores a prior (archived) version's prices
-- by re-applying them as a brand-new version — append-only, never rewriting
-- history in place. The version that was active gets marked 'rolled_back'
-- (distinct from the normal 'archived' a newer import produces) so it's
-- clear from history that an operator reverted it rather than superseding
-- it with fresh data.
-- ---------------------------------------------------------------------------
create or replace function rollback_price_list_version(p_target_version_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target price_list_versions%rowtype;
  v_new_version_id uuid;
  v_next_version_number integer;
  v_row_count integer;
  v_price test_prices%rowtype;
begin
  select * into v_target from price_list_versions where id = p_target_version_id for update;
  if not found then
    raise exception 'Import version % not found', p_target_version_id;
  end if;
  if v_target.status not in ('archived', 'rolled_back') then
    raise exception 'Can only roll back to an archived version (version % is "%")', p_target_version_id, v_target.status;
  end if;

  select count(*) into v_row_count from test_prices where version_id = p_target_version_id;
  if v_row_count = 0 then
    raise exception 'Version % has no priced rows to restore', p_target_version_id;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version_number
    from price_list_versions
    where location_id = v_target.location_id and service_type = v_target.service_type;

  -- Vacate the currently active version first — the partial unique index
  -- allows only one 'active' row per (location, service_type) at a time.
  update price_list_versions
    set status = 'rolled_back'
    where location_id = v_target.location_id
      and service_type = v_target.service_type
      and status = 'active';

  insert into price_list_versions (
    version_number, location_id, service_type, original_filename, status, record_count, created_by, activated_at
  ) values (
    v_next_version_number,
    v_target.location_id,
    v_target.service_type,
    'Rollback to version ' || v_target.version_number,
    'active',
    v_row_count,
    p_user_id,
    now()
  )
  returning id into v_new_version_id;

  for v_price in select * from test_prices where version_id = p_target_version_id loop
    update test_prices
      set effective_to = now()
      where test_id = v_price.test_id
        and location_id = v_target.location_id
        and service_type = v_target.service_type
        and effective_to is null;

    insert into test_prices (
      test_id, location_id, service_type, price, currency_code, tat_text, availability, version_id, effective_from
    ) values (
      v_price.test_id,
      v_target.location_id,
      v_target.service_type,
      v_price.price,
      v_price.currency_code,
      v_price.tat_text,
      v_price.availability,
      v_new_version_id,
      now()
    );
  end loop;

  insert into audit_log (user_id, action, entity, entity_id, old_value, new_value)
  values (
    p_user_id,
    'rollback_import',
    'price_list_versions',
    v_new_version_id,
    jsonb_build_object('restoredFromVersionId', p_target_version_id, 'restoredFromVersionNumber', v_target.version_number),
    jsonb_build_object('recordCount', v_row_count)
  );

  return v_new_version_id;
end;
$$;
