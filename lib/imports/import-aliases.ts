import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAllTests } from "@/lib/database/tests";
import { listAllAliasesWithTest } from "@/lib/database/aliases";
import { normalizeQuery } from "@/lib/search/normalize-query";
import { parseAliasWorkbook } from "@/lib/excel/parse-alias-workbook";
import type { AliasType } from "@/lib/constants/alias-types";

// Aliases from a curated file are trusted, but a hair below a hand-entered
// admin alias (100) so a deliberate manual alias still wins a tie.
const IMPORTED_ALIAS_CONFIDENCE = 95;
const INSERT_CHUNK_SIZE = 500;

export interface PlannedAlias {
  testId: string;
  testCode: string;
  testName: string;
  alias: string;
  normalizedAlias: string;
  aliasType: AliasType;
}

export interface AliasImportPlan {
  /** Rows in the file with a test code. */
  rowCount: number;
  /** Rows whose code matched a catalog test. */
  matchedTests: number;
  /** New aliases that would be created. */
  toCreate: PlannedAlias[];
  /** Aliases skipped because the test already has them (or they only repeat its own code/name). */
  alreadyCovered: number;
  /** Test codes in the file that aren't in the catalog — their aliases are skipped, never attached to a guess. */
  unknownCodes: string[];
  /**
   * Aliases skipped because they already name a *different* test (its code,
   * name, short name or an existing alias), or that an earlier row of the
   * file already claimed for another test — adding them would make that
   * search ambiguous.
   */
  conflicts: { testCode: string; alias: string; otherCodes: string[] }[];
}

// Short, space-free tokens with a capital or digit ("A2M", "HbA1c", "25OHD")
// read as abbreviations; anything else is how a customer might phrase it.
function classifyAlias(alias: string): AliasType {
  return !/\s/.test(alias) && alias.length <= 10 && /[A-Z0-9]/.test(alias) ? "abbreviation" : "customer_term";
}

/**
 * Works out which aliases in an uploaded test-catalog workbook are new.
 * Matches rows to catalog tests by test code only (case/space-insensitive)
 * and never creates tests — an unknown code is reported, not guessed.
 */
export async function planAliasImport(buffer: Buffer): Promise<AliasImportPlan> {
  const [rows, tests, existing] = await Promise.all([
    parseAliasWorkbook(buffer),
    listAllTests(),
    listAllAliasesWithTest(),
  ]);

  const codeKey = (code: string) => code.replace(/\s+/g, "").toUpperCase();
  const testByCode = new Map(tests.map((test) => [codeKey(test.code), test]));
  // Per test: every normalized string search already matches on.
  const covered = new Map<string, Set<string>>();
  for (const test of tests) {
    covered.set(
      test.id,
      new Set([normalizeQuery(test.code), normalizeQuery(test.officialName), normalizeQuery(test.shortName ?? "")])
    );
  }
  for (const alias of existing) covered.get(alias.testId)?.add(alias.normalizedAlias);
  // Reverse view: normalized text -> codes of every test it already names.
  const codeById = new Map(tests.map((test) => [test.id, test.code]));
  const ownersByText = new Map<string, Set<string>>();
  for (const [testId, texts] of covered) {
    for (const text of texts) {
      if (!text) continue;
      if (!ownersByText.has(text)) ownersByText.set(text, new Set());
      ownersByText.get(text)!.add(codeById.get(testId)!);
    }
  }

  const toCreate: PlannedAlias[] = [];
  const unknownCodes = new Set<string>();
  const conflicts: AliasImportPlan["conflicts"] = [];
  let matchedTests = 0;
  let alreadyCovered = 0;

  for (const row of rows) {
    const test = testByCode.get(codeKey(row.testCode));
    if (!test) {
      unknownCodes.add(row.testCode);
      continue;
    }
    matchedTests += 1;
    const seen = covered.get(test.id)!;
    for (const alias of row.aliases) {
      const normalizedAlias = normalizeQuery(alias);
      if (!normalizedAlias || seen.has(normalizedAlias)) {
        alreadyCovered += 1;
        continue;
      }
      const owners = ownersByText.get(normalizedAlias);
      const otherCodes = owners ? [...owners].filter((code) => code !== test.code) : [];
      if (otherCodes.length > 0) {
        conflicts.push({ testCode: test.code, alias, otherCodes });
        continue;
      }
      seen.add(normalizedAlias);
      if (!owners) ownersByText.set(normalizedAlias, new Set());
      ownersByText.get(normalizedAlias)!.add(test.code);
      toCreate.push({
        testId: test.id,
        testCode: test.code,
        testName: test.officialName,
        alias,
        normalizedAlias,
        aliasType: classifyAlias(alias),
      });
    }
  }

  return {
    rowCount: rows.length,
    matchedTests,
    toCreate,
    alreadyCovered,
    unknownCodes: [...unknownCodes],
    conflicts,
  };
}

/** Inserts a plan's new aliases. Re-running the same file is safe: (test_id, alias) duplicates are ignored. */
export async function commitAliasImport(plan: AliasImportPlan): Promise<number> {
  const supabase = createAdminClient();
  let inserted = 0;
  for (let start = 0; start < plan.toCreate.length; start += INSERT_CHUNK_SIZE) {
    const chunk = plan.toCreate.slice(start, start + INSERT_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("test_aliases")
      .upsert(
        chunk.map((alias) => ({
          test_id: alias.testId,
          alias: alias.alias,
          normalized_alias: alias.normalizedAlias,
          alias_type: alias.aliasType,
          confidence: IMPORTED_ALIAS_CONFIDENCE,
        })),
        { onConflict: "test_id,alias", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return inserted;
}
