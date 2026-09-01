import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TestAlias } from "@/types/test";

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
  const { data, error } = await supabase
    .from("test_aliases")
    .select(ALIAS_COLUMNS)
    .eq("active", true);

  if (error) throw error;
  return ((data ?? []) as TestAliasRow[]).map(mapAlias);
}
