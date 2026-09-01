-- Dev/test seed data for local development and Phase 6-7 verification.
-- Generic, illustrative lab test names only — NOT real AVM Labs pricing or
-- catalog data (per spec section 60, dummy records only, clearly marked).
-- Safe to re-run (idempotent via fixed ids + ON CONFLICT).

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
insert into locations (id, code, name, country, currency_code, currency_symbol, active) values
  ('00000000-0000-0000-0000-000000000001', 'DUB', 'Dubai', 'United Arab Emirates', 'AED', 'AED', true),
  ('00000000-0000-0000-0000-000000000002', 'RUH', 'Riyadh', 'Saudi Arabia', 'SAR', 'SAR', true),
  ('00000000-0000-0000-0000-000000000003', 'KHO', 'Khobar', 'Saudi Arabia', 'SAR', 'SAR', true),
  ('00000000-0000-0000-0000-000000000004', 'BAH', 'Bahrain', 'Bahrain', 'BHD', 'BHD', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tests (dummy/sample records — see AVM_PLAN.md and spec section 60)
-- ---------------------------------------------------------------------------
insert into tests (id, code, official_name, short_name, category, active) values
  ('00000000-0000-0000-0000-000000000101', 'TEST-001', 'Sample Complete Blood Count', 'CBC', 'Hematology', true),
  ('00000000-0000-0000-0000-000000000102', 'TEST-002', 'Sample HbA1c', 'HbA1c', 'Diabetes', true),
  ('00000000-0000-0000-0000-000000000103', 'TEST-003', 'Sample Vitamin D (25-OH)', 'Vit D', 'Vitamins', true),
  ('00000000-0000-0000-0000-000000000104', 'TEST-004', 'Sample Insulin PP', 'Insulin PP', 'Diabetes', true),
  ('00000000-0000-0000-0000-000000000105', 'TEST-005', 'Sample Vitamin B12', 'B12', 'Vitamins', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- test_aliases — the "insulin resistance" -> Insulin PP example from the brief
-- ---------------------------------------------------------------------------
insert into test_aliases (test_id, alias, normalized_alias, alias_type, confidence, active) values
  ('00000000-0000-0000-0000-000000000104', 'insulin resistance', 'insulin resistance', 'customer_term', 100, true),
  ('00000000-0000-0000-0000-000000000102', 'sugar test', 'sugar test', 'customer_term', 90, true),
  ('00000000-0000-0000-0000-000000000102', 'a1c', 'a1c', 'abbreviation', 100, true),
  ('00000000-0000-0000-0000-000000000103', 'vit d', 'vit d', 'abbreviation', 100, true),
  ('00000000-0000-0000-0000-000000000103', 'vitamin d test', 'vitamin d test', 'customer_term', 95, true),
  ('00000000-0000-0000-0000-000000000101', 'blood count', 'blood count', 'customer_term', 90, true),
  ('00000000-0000-0000-0000-000000000105', 'vitamin b12', 'vitamin b12', 'customer_term', 100, true)
on conflict (test_id, alias) do nothing;

-- ---------------------------------------------------------------------------
-- test_prices (current rows: effective_to is null)
-- ---------------------------------------------------------------------------
insert into test_prices (test_id, location_id, service_type, price, currency_code, tat_text, availability) values
  -- CBC
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'in_house', 5000, 'AED', 'Same day', 'available'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'in_house', 6000, 'SAR', 'Same day', 'available'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000003', 'outsource', 6500, 'SAR', '24 hours', 'available'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000004', 'in_house', 7500, 'BHD', 'Same day', 'available'),
  -- HbA1c
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'in_house', 12000, 'AED', 'Same day', 'available'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002', 'in_house', 9000, 'SAR', '24 hours', 'available'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000003', 'in_house', 9500, 'SAR', '24 hours', 'available'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000004', 'outsource', 35000, 'BHD', '3 working days', 'available'),
  -- Vitamin D
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'in_house', 25000, 'AED', '24 hours', 'available'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000002', 'outsource', 20000, 'SAR', '2-3 working days', 'available'),
  -- Insulin PP
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'outsource', 18000, 'AED', '3 working days', 'available'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000003', 'outsource', 15000, 'SAR', '3 working days', 'available'),
  -- Vitamin B12
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'in_house', 15000, 'AED', 'Same day', 'available'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000004', 'in_house', 45000, 'BHD', 'Same day', 'available')
on conflict (test_id, location_id, service_type) where (effective_to is null) do nothing;

-- ---------------------------------------------------------------------------
-- profiles — "Diabetes Panel" = HbA1c + Insulin PP, bundle-priced
-- ---------------------------------------------------------------------------
insert into profiles (id, code, name, description, active) values
  ('00000000-0000-0000-0000-000000000201', 'PROFILE-001', 'Sample Diabetes Panel', 'HbA1c + Insulin PP', true)
on conflict (id) do nothing;

insert into profile_tests (profile_id, test_id, required) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000102', true),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000104', true)
on conflict (profile_id, test_id) do nothing;

insert into profile_prices (profile_id, location_id, service_type, price, currency_code, tat_text, availability) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'in_house', 25000, 'AED', 'Same day', 'available'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000003', 'outsource', 21000, 'SAR', '3 working days', 'available')
on conflict (profile_id, location_id, service_type) where (effective_to is null) do nothing;
