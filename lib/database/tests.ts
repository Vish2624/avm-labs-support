import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";
import { testTypeFromCategory, viaProfileFromCategory, type Test, type TestComponent } from "@/types/test";
import { cachedCatalogRead, invalidatesCatalog } from "@/lib/database/catalog-cache";

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

interface TestComponentRow {
  id: string;
  parent_test_id: string;
  component_test_id: string;
  created_at: string;
}

function mapTestComponent(row: TestComponentRow): TestComponent {
  return {
    id: row.id,
    parentTestId: row.parent_test_id,
    componentTestId: row.component_test_id,
    createdAt: row.created_at,
  };
}

/** A test row without its links — componentIds/sourceTestIds come from withLinks(). */
function mapTest(row: TestRow): Test {
  return {
    id: row.id,
    code: row.code,
    officialName: row.official_name,
    shortName: row.short_name,
    category: row.category,
    description: row.description,
    testType: testTypeFromCategory(row.category),
    componentIds: [],
    sourceTestIds: [],
    viaProfileCode: viaProfileFromCategory(row.category),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every parent -> child link (component -> parameter, calculated -> source). */
export function listTestComponents(): Promise<TestComponent[]> {
  return cachedCatalogRead("test-components", async () => {
    const supabase = createAdminClient();
    const rows = await fetchAllRows<TestComponentRow>((from, to) =>
      supabase
        .from("test_components")
        .select("id, parent_test_id, component_test_id, created_at")
        .order("id")
        .range(from, to)
    );
    return rows.map(mapTestComponent);
  });
}

/**
 * Fills in each test's links: a parameter's components, a calculated
 * parameter's source tests (ordered by the source's code). Links are read by
 * the parent's type, so a component's own row never gets sourceTestIds and
 * vice versa.
 */
function withLinks(tests: Test[], allLinks: TestComponent[]): Test[] {
  const typeById = new Map(tests.map((test) => [test.id, test.testType]));
  const codeById = new Map(tests.map((test) => [test.id, test.code]));
  const links = [...allLinks].sort((a, b) =>
    (codeById.get(a.componentTestId) ?? "").localeCompare(codeById.get(b.componentTestId) ?? "")
  );
  const componentIds = new Map<string, string[]>();
  const sourceTestIds = new Map<string, string[]>();
  for (const link of links) {
    const parentType = typeById.get(link.parentTestId);
    if (parentType === "component") {
      componentIds.set(link.componentTestId, [...(componentIds.get(link.componentTestId) ?? []), link.parentTestId]);
    } else if (parentType === "calculated") {
      sourceTestIds.set(link.parentTestId, [...(sourceTestIds.get(link.parentTestId) ?? []), link.componentTestId]);
    }
  }
  return tests.map((test) => ({
    ...test,
    componentIds: componentIds.get(test.id) ?? [],
    sourceTestIds: sourceTestIds.get(test.id) ?? [],
  }));
}

/** Every active test in the master catalog, with its links — the candidate set searchTests() ranks against. */
export function listActiveTests(): Promise<Test[]> {
  return cachedCatalogRead("tests:active", async () => {
    const supabase = createAdminClient();
    const [rows, links] = await Promise.all([
      fetchAllRows<TestRow>((from, to) =>
        supabase.from("tests").select(TEST_COLUMNS).eq("active", true).order("id").range(from, to)
      ),
      listTestComponents(),
    ]);
    return withLinks(rows.map(mapTest), links);
  });
}

/** Fetch specific tests by id (e.g. to hydrate profile_tests/quotation line items). */
export async function getTestsByIds(ids: string[]): Promise<Test[]> {
  if (ids.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tests").select(TEST_COLUMNS).in("id", ids);

  if (error) throw error;
  return ((data ?? []) as TestRow[]).map(mapTest);
}

/** Every test, active or not, with its links — the Admin Tests catalog table. */
export async function listAllTests(): Promise<Test[]> {
  const supabase = createAdminClient();
  const [rows, links] = await Promise.all([
    fetchAllRows<TestRow>((from, to) =>
      supabase.from("tests").select(TEST_COLUMNS).order("code", { ascending: true }).order("id").range(from, to)
    ),
    listTestComponents(),
  ]);
  return withLinks(rows.map(mapTest), links);
}

export interface TestInput {
  code: string;
  officialName: string;
  shortName: string | null;
  category: string | null;
  description: string | null;
}

async function createTestUncached(input: TestInput): Promise<Test> {
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

async function updateTestUncached(id: string, input: TestInput): Promise<Test> {
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

async function setTestActiveUncached(id: string, active: boolean): Promise<Test> {
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

// Writes drop the search catalog cache (lib/database/catalog-cache.ts) once they settle.
export const createTest = invalidatesCatalog(createTestUncached);
export const updateTest = invalidatesCatalog(updateTestUncached);
export const setTestActive = invalidatesCatalog(setTestActiveUncached);
