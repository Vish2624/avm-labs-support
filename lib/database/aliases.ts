import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type { TestAlias, AliasType } from "@/types/test";

const ALIAS_COLUMNS =
  "id, test_id, alias, normalized_alias, alias_type, confidence, active, created_at, updated_at";

interface TestAliasRow {
  id: string;
  test_id: string;
  alias: string;
  normalized_alias: string;
  alias_type: TestAlias["aliasType"];
  confidence: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapAlias(row: TestAliasRow): TestAlias {
  return {
    id: row.id,
    testId: row.test_id,
    alias: row.alias,
    normalizedAlias: row.normalized_alias,
    aliasType: row.alias_type,
    confidence: row.confidence,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every active admin-curated alias — the second signal searchTests() ranks against. */
export async function listActiveAliases(): Promise<TestAlias[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<TestAliasRow>((from, to) =>
    supabase.from("test_aliases").select(ALIAS_COLUMNS).eq("active", true).order("id").range(from, to)
  );
  return rows.map(mapAlias);
}

/** Every alias (active or not) for one test — the Admin test detail view. */
export async function listAliasesForTest(testId: string): Promise<TestAlias[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_aliases")
    .select(ALIAS_COLUMNS)
    .eq("test_id", testId)
    .order("alias", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as TestAliasRow[]).map(mapAlias);
}

export interface AliasWithTest extends TestAlias {
  testCode: string;
  testOfficialName: string;
}

/** Every alias (active or not), joined with its test's code/name — the Admin Aliases table. */
export async function listAllAliasesWithTest(): Promise<AliasWithTest[]> {
  const supabase = createAdminClient();
  type JoinedRow = TestAliasRow & { tests: { code: string; official_name: string } | { code: string; official_name: string }[] | null };
  const rows = await fetchAllRows<JoinedRow>(
    (from, to) =>
      supabase
        .from("test_aliases")
        .select(`${ALIAS_COLUMNS}, tests(code, official_name)`)
        .order("alias", { ascending: true })
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: JoinedRow[] | null; error: unknown }>
  );
  return rows.map((row) => {
    const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
    return { ...mapAlias(row), testCode: test?.code ?? "", testOfficialName: test?.official_name ?? "" };
  });
}

export interface AliasInput {
  testId: string;
  alias: string;
  normalizedAlias: string;
  aliasType: AliasType;
  confidence: number;
}

export async function createAlias(input: AliasInput): Promise<TestAlias> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_aliases")
    .insert({
      test_id: input.testId,
      alias: input.alias,
      normalized_alias: input.normalizedAlias,
      alias_type: input.aliasType,
      confidence: input.confidence,
    })
    .select(ALIAS_COLUMNS)
    .single();

  if (error) throw error;
  return mapAlias(data as TestAliasRow);
}

export async function updateAlias(id: string, input: AliasInput): Promise<TestAlias> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_aliases")
    .update({
      test_id: input.testId,
      alias: input.alias,
      normalized_alias: input.normalizedAlias,
      alias_type: input.aliasType,
      confidence: input.confidence,
    })
    .eq("id", id)
    .select(ALIAS_COLUMNS)
    .single();

  if (error) throw error;
  return mapAlias(data as TestAliasRow);
}

export async function setAliasActive(id: string, active: boolean): Promise<TestAlias> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("test_aliases")
    .update({ active })
    .eq("id", id)
    .select(ALIAS_COLUMNS)
    .single();

  if (error) throw error;
  return mapAlias(data as TestAliasRow);
}

export async function deleteAlias(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("test_aliases").delete().eq("id", id);
  if (error) throw error;
}
