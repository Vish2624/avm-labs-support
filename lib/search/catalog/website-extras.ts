import { normalizeQuery } from "../matching/normalize-query";
import type { SearchableTest } from "../matching/build-search-candidates";
import type { CatalogCalculatedParameter } from "./search-catalog";

/** A live website test as search needs it: its id here and the parameters the website lists for it. */
export interface WebsiteSearchTest {
  id: string;
  officialName: string;
  shortName: string | null;
  parameters: string[];
}

/** A live website profile: its id and code here, and the groups "What's included" shows (test ids here). */
export interface WebsiteSearchProfile {
  id: string;
  code: string;
  name: string;
  subs: { name: string; tests: string[]; calc: string[] }[];
}

/** What search adds from the website's catalogue on top of the tests and aliases. */
export interface WebsiteSearchExtras {
  /** Each parameter a test lists ("Platelet Count" in the CBC), matching sends to the test(s) it's part of. */
  parameters: SearchableTest[];
  /**
   * Groups inside profiles that aren't profiles of their own (Pancreatic
   * Profile: Amylase + Lipase), as `kind: "group"` with their tests to add
   * and the profiles that include them; and the calculated items profiles
   * report (eGFR), as `kind: "calculated"` with the smallest profile they come in.
   */
  calculated: CatalogCalculatedParameter[];
}

// Group names that only sort a profile's list, not a set of tests anyone asks for by name.
const GENERIC_GROUPS = new Set(["tests", "additional tests", "other tests"]);

const key = (value: string) => normalizeQuery(value).replace(/\s+/g, "");

/**
 * Builds the extras from the live website tests and profiles. Pure: the
 * loader (lib/database/website-catalog.ts) reads the rows the website pushed.
 */
export function buildWebsiteSearchExtras({
  tests,
  profiles,
}: {
  tests: WebsiteSearchTest[];
  profiles: WebsiteSearchProfile[];
}): WebsiteSearchExtras {
  // Parameters: one entry per name, pointing at every test that lists it. A
  // test's own name isn't a parameter of it (a single-parameter test lists itself).
  const parameterTests = new Map<string, { name: string; testIds: string[] }>();
  for (const test of tests) {
    const own = new Set([key(test.officialName), test.shortName ? key(test.shortName) : ""]);
    for (const name of new Set(test.parameters.map((p) => p.trim()).filter(Boolean))) {
      const k = key(name);
      if (!k || own.has(k)) continue;
      const entry = parameterTests.get(k) ?? { name, testIds: [] };
      if (!entry.testIds.includes(test.id)) entry.testIds.push(test.id);
      parameterTests.set(k, entry);
    }
  }
  const parameters: SearchableTest[] = [...parameterTests].map(([k, { name, testIds }]) => ({
    id: `parameter:${k}`,
    code: "",
    officialName: name,
    shortName: null,
    componentIds: testIds,
  }));

  const testCount = new Map(profiles.map((p) => [p.id, new Set(p.subs.flatMap((s) => s.tests)).size]));
  const profileNames = new Set(profiles.map((p) => key(p.name)));
  const nameById = new Map(tests.map((t) => [t.id, t.officialName]));

  // Groups: one per name and set of tests, since profiles can hold different
  // tests under the same heading (Cancer Markers for men and for women). A
  // name that is also a profile's ("Lipid Profile") is found as that profile instead.
  const groups = new Map<string, { name: string; testIds: string[]; profileIds: string[] }>();
  // Calculated items: every profile reporting each one, and the group it's reported in.
  const calcs = new Map<string, { name: string; group: string; profileIds: string[] }>();
  for (const profile of profiles) {
    for (const sub of profile.subs) {
      const k = key(sub.name);
      const testIds = sub.tests.filter((id) => nameById.has(id));
      if (k && testIds.length > 0 && !GENERIC_GROUPS.has(normalizeQuery(sub.name)) && !profileNames.has(k)) {
        const groupKey = `${k}|${[...testIds].sort().join(",")}`;
        const group = groups.get(groupKey) ?? { name: sub.name, testIds, profileIds: [] };
        if (!group.profileIds.includes(profile.id)) group.profileIds.push(profile.id);
        groups.set(groupKey, group);
      }
      for (const calcName of sub.calc) {
        const c = key(calcName);
        if (!c) continue;
        const calc = calcs.get(c) ?? { name: calcName.trim(), group: sub.name, profileIds: [] };
        if (!calc.profileIds.includes(profile.id)) calc.profileIds.push(profile.id);
        calcs.set(c, calc);
      }
    }
  }

  const codeById = new Map(profiles.map((p) => [p.id, p.code]));
  const smallest = (ids: string[]) =>
    [...ids].sort((a, b) => (testCount.get(a) ?? 0) - (testCount.get(b) ?? 0))[0];

  return {
    parameters,
    calculated: [
      ...[...groups].map(([k, g]): CatalogCalculatedParameter => ({
        id: `group:${k}`,
        code: "",
        officialName: g.name,
        shortName: null,
        description: null,
        sourceNames: g.testIds.map((id) => nameById.get(id) ?? id),
        orderTestIds: g.testIds,
        viaProfileCode: null,
        kind: "group",
        profileIds: g.profileIds,
      })),
      ...[...calcs].map(([k, c]): CatalogCalculatedParameter => ({
        id: `calculated:${k}`,
        code: "",
        officialName: c.name,
        shortName: null,
        description: `Reported in the ${c.group} group.`,
        sourceNames: [],
        orderTestIds: [],
        viaProfileCode: codeById.get(smallest(c.profileIds)) ?? null,
        kind: "calculated",
        profileIds: c.profileIds,
      })),
    ],
  };
}
