import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWebsiteSearchExtras, type WebsiteSearchProfile } from "@/lib/search/catalog/website-extras";
import {
  searchCatalogCalculated,
  searchCatalogProfiles,
  searchCatalogTests,
  type SearchCatalog,
} from "@/lib/search/catalog/search-catalog";
import type { SearchTestResult } from "@/types/search";
import type { ProfileSearchResult } from "@/types/profile";

// Dummy tests and profiles (never real AVM data), shaped like what the website pushes.
const TESTS = [
  { id: "cbc", officialName: "Complete Blood Count", shortName: "CBC", parameters: ["Hemoglobin", "Platelet Count", "Complete Blood Count"] },
  { id: "amy", officialName: "Amylase", shortName: null, parameters: ["Amylase"] },
  { id: "lip", officialName: "Lipase", shortName: null, parameters: ["Lipase"] },
  { id: "cre", officialName: "Creatinine", shortName: null, parameters: ["Creatinine"] },
  { id: "ure", officialName: "Urea", shortName: null, parameters: ["Urea"] },
];
const PROFILES: WebsiteSearchProfile[] = [
  {
    id: "kidney",
    code: "KFT",
    name: "Kidney Panel",
    subs: [{ name: "Tests", tests: ["cre", "ure"], calc: ["eGFR"] }],
  },
  {
    id: "big",
    code: "BIG",
    name: "Big Checkup",
    subs: [
      { name: "Pancreas Group", tests: ["amy", "lip"], calc: [] },
      { name: "Kidney Panel", tests: ["cre", "ure"], calc: ["eGFR"] },
      { name: "Additional tests", tests: ["cbc"], calc: [] },
    ],
  },
];

const extras = () => buildWebsiteSearchExtras({ tests: TESTS, profiles: PROFILES });

test("a test's parameters point at the test, but not its own name", () => {
  const { parameters } = extras();
  assert.deepEqual(
    parameters.map((p) => [p.officialName, p.componentIds]),
    [
      ["Hemoglobin", ["cbc"]],
      ["Platelet Count", ["cbc"]],
    ]
  );
});

test("groups inside profiles, except generic ones and ones that are profiles themselves", () => {
  const groups = extras().calculated.filter((c) => c.kind === "group");
  assert.deepEqual(
    groups.map((g) => [g.officialName, g.orderTestIds, g.sourceNames, g.profileIds]),
    [["Pancreas Group", ["amy", "lip"], ["Amylase", "Lipase"], ["big"]]]
  );
});

test("the same group name with different tests in two profiles is two groups, each with its own profiles", () => {
  const { calculated } = buildWebsiteSearchExtras({
    tests: TESTS,
    profiles: [
      { id: "men", code: "M", name: "Men", subs: [{ name: "Markers", tests: ["amy", "lip"], calc: [] }] },
      { id: "women", code: "W", name: "Women", subs: [{ name: "Markers", tests: ["amy", "cre"], calc: [] }] },
    ],
  });
  assert.deepEqual(
    calculated.map((g) => [g.officialName, g.orderTestIds, g.profileIds]),
    [
      ["Markers", ["amy", "lip"], ["men"]],
      ["Markers", ["amy", "cre"], ["women"]],
    ]
  );
});

test("a calculated item comes with the smallest profile that reports it", () => {
  const [calc] = extras().calculated.filter((c) => c.kind === "calculated");
  assert.equal(calc.officialName, "eGFR");
  assert.equal(calc.viaProfileCode, "KFT");
  assert.deepEqual(calc.profileIds, ["kidney", "big"]);
});

function catalog(): SearchCatalog {
  const { parameters, calculated } = extras();
  const priced: SearchTestResult[] = TESTS.map((t) => ({
    testId: t.id,
    code: t.id.toUpperCase(),
    officialName: t.officialName,
    shortName: t.shortName,
    category: null,
    matchType: "fuzzy",
    matchedAlias: null,
    includedParameter: null,
    price: { amount: 1000, currency: "AED" },
    tatText: "24 hrs",
    availability: "available",
    serviceType: "in_house",
  }));
  const profile = (p: WebsiteSearchProfile): ProfileSearchResult => ({
    profileId: p.id,
    code: p.code,
    name: p.name,
    description: null,
    tests: [...new Set(p.subs.flatMap((s) => s.tests))].map((id) => ({
      testId: id,
      code: id.toUpperCase(),
      officialName: TESTS.find((t) => t.id === id)!.officialName,
    })),
    price: { amount: 5000, currency: "AED" },
    tatText: "24 hrs",
    availability: "available",
    serviceType: "in_house",
    includedTest: null,
    nameScore: null,
  });
  return {
    tests: [...TESTS.map(({ id, officialName, shortName }) => ({ id, code: id.toUpperCase(), officialName, shortName })), ...parameters],
    aliases: [],
    priced,
    profiles: PROFILES.map(profile),
    calculated,
  };
}

test("searching a parameter finds the test it's part of", () => {
  const [first] = searchCatalogTests("platelet count", catalog());
  assert.equal(first.testId, "cbc");
  assert.equal(first.includedParameter, "Platelet Count");
});

test("searching a group offers its tests and lists the profiles that include it", () => {
  const [group] = searchCatalogCalculated("pancreas group", catalog());
  assert.equal(group.kind, "group");
  assert.deepEqual(
    group.sources.map((s) => s.testId),
    ["amy", "lip"]
  );
  assert.deepEqual(group.partOf, ["Big Checkup"]);

  const profiles = searchCatalogProfiles("pancreas group", catalog());
  assert.equal(profiles[0].profileId, "big");
  assert.equal(profiles[0].includedGroup, "Pancreas Group");
});

test("searching a calculated item offers the profile it comes in", () => {
  const [calc] = searchCatalogCalculated("egfr", catalog());
  assert.equal(calc.kind, "calculated");
  assert.equal(calc.viaProfile?.profileId, "kidney");
});
