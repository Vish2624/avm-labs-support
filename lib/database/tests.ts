import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import type { Test } from "@/types/test";

const TEST_COLUMNS =
  "id, code, official_name, short_name, category, description, active, created_at, updated_at";

interface TestRow {
  id: string;
  code: string;
  official_name: string;
  short_name: string | null;
  category: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapTest(row: TestRow): Test {
  return {
    id: row.id,
    code: row.code,
    officialName: row.official_name,
    shortName: row.short_name,
    category: row.category,
    description: row.description,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every active test in the master catalog — the candidate set searchTests() ranks against. */
export async function listActiveTests(): Promise<Test[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<TestRow>((from, to) =>
    supabase.from("tests").select(TEST_COLUMNS).eq("active", true).order("id").range(from, to)
  );
  return rows.map(mapTest);
}

/** Fetch specific tests by id (e.g. to hydrate profile_tests/quotation line items). */
export async function getTestsByIds(ids: string[]): Promise<Test[]> {
  if (ids.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tests").select(TEST_COLUMNS).in("id", ids);

  if (error) throw error;
  return ((data ?? []) as TestRow[]).map(mapTest);
}

/** Every test, active or not — the Admin Tests catalog table. */
export async function listAllTests(): Promise<Test[]> {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<TestRow>((from, to) =>
    supabase.from("tests").select(TEST_COLUMNS).order("code", { ascending: true }).order("id").range(from, to)
  );
  return rows.map(mapTest);
}

export interface TestInput {
  code: string;
  officialName: string;
  shortName: string | null;
  category: string | null;
  description: string | null;
}

export async function createTest(input: TestInput): Promise<Test> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tests")
    .insert({
      code: input.code,
      official_name: input.officialName,
      short_name: input.shortName,
      category: input.category,
      description: input.description,
    })
    .select(TEST_COLUMNS)
    .single();

  if (error) throw error;
  return mapTest(data as TestRow);
}

export async function updateTest(id: string, input: TestInput): Promise<Test> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tests")
    .update({
      code: input.code,
      official_name: input.officialName,
      short_name: input.shortName,
      category: input.category,
      description: input.description,
    })
    .eq("id", id)
    .select(TEST_COLUMNS)
    .single();

  if (error) throw error;
  return mapTest(data as TestRow);
}

export async function setTestActive(id: string, active: boolean): Promise<Test> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tests")
    .update({ active })
    .eq("id", id)
    .select(TEST_COLUMNS)
    .single();

  if (error) throw error;
  return mapTest(data as TestRow);
}

export async function getTestById(id: string): Promise<Test | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tests").select(TEST_COLUMNS).eq("id", id).maybeSingle();

  if (error) throw error;
  return data ? mapTest(data as TestRow) : null;
}
