import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { data, error } = await supabase.from("tests").select(TEST_COLUMNS).eq("active", true);

  if (error) throw error;
  return ((data ?? []) as TestRow[]).map(mapTest);
}

/** Fetch specific tests by id (e.g. to hydrate profile_tests/quotation line items). */
export async function getTestsByIds(ids: string[]): Promise<Test[]> {
  if (ids.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tests").select(TEST_COLUMNS).in("id", ids);

  if (error) throw error;
  return ((data ?? []) as TestRow[]).map(mapTest);
}
