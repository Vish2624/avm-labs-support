import { test } from "node:test";
import assert from "node:assert/strict";
import { matchScore } from "@/lib/search/matching/fuzzy-match";
import { normalizeQuery } from "@/lib/search/matching/normalize-query";
import { queryVariants } from "@/lib/search/matching/query-variants";
import { searchCatalogTests, type SearchCatalog } from "@/lib/search/catalog/search-catalog";
import type { SearchTestResult } from "@/types/search";

// A small illustrative catalog: dummy codes and prices, never real AVM data.
const CATALOG_TESTS: [code: string, name: string, shortName: string | null][] = [
  ["H6", "Hemogram", "CBC"],
  ["VITD", "Vitamin D 25 Hydroxy", null],
  ["B12", "Vitamin B12", null],
  ["TSH", "Thyroid Stimulating Hormone", "TSH"],
  ["TFT", "Thyroid Profile", null],
  ["HBA1C", "Glycated Hemoglobin", "HbA1c"],
  ["FBS", "Glucose Fasting", null],
  ["LFT", "Liver Function Test", null],
  ["KFT", "Kidney Function Test", null],
  ["ALT", "Alanine Aminotransferase", "ALT"],
  ["AST", "Aspartate Aminotransferase", "AST"],
  ["LIPID", "Lipid Profile", null],
  ["FER", "Ferritin", null],
  ["CRP", "C Reactive Protein", "CRP"],
  ["URIC", "Uric Acid", null],
  ["FOL", "Folic Acid", null],
  ["VITK", "Vitamin K", null],
];

function catalog(): SearchCatalog {
  const tests = CATALOG_TESTS.map(([code, officialName, shortName]) => ({ id: code, code, officialName, shortName }));
  const priced: SearchTestResult[] = tests.map((t) => ({
    testId: t.id,
    code: t.code,
    officialName: t.officialName,
    shortName: t.shortName,
    category: null,
    matchType: "fuzzy",
    matchedAlias: null,
    price: { amount: 1000, currency: "AED" },
    tatText: "24 hours",
    availability: "available",
    serviceType: "in_house",
  }));
  return { tests, aliases: [], priced, profiles: [], calculated: [] };
}

const top = (query: string) => searchCatalogTests(query, catalog())[0]?.code ?? null;

test("exact names and codes come first", () => {
  assert.equal(top("tsh"), "TSH");
  assert.equal(top("ferritin"), "FER");
  assert.equal(top("hba1c"), "HBA1C");
  assert.equal(top("hb a1c"), "HBA1C");
});

test("typos still find the test", () => {
  assert.equal(top("feritin"), "FER");
  assert.equal(top("vitmin b12"), "B12");
  assert.equal(top("thyriod profile"), "TFT");
  assert.equal(top("uric acd"), "URIC");
});

test("everyday shorthand finds the catalog name", () => {
  assert.equal(top("cbc"), "H6");
  assert.equal(top("vit d"), "VITD");
  assert.equal(top("vit d3"), "VITD");
  assert.equal(top("a1c"), "HBA1C");
  assert.equal(top("fbs"), "FBS");
  assert.equal(top("fasting sugar"), "FBS");
  assert.equal(top("sgpt"), "ALT");
  assert.equal(top("sgot"), "AST");
  assert.equal(top("lft"), "LFT");
  assert.equal(top("folate"), "FOL");
  assert.equal(top("t3 t4 tsh"), "TFT");
});

test("conversational words around a test name are ignored", () => {
  assert.equal(top("i need vitamin b12 test please"), "B12");
  assert.equal(top("price of ferritin"), "FER");
});

test("a different short identifier is never read as a lookalike", () => {
  // "vitamin k" must not become Vitamin B12 or Vitamin D.
  assert.equal(top("vitamin k"), "VITK");
  assert.ok(matchScore(normalizeQuery("vitamin k"), normalizeQuery("Vitamin B12")) < 0.45);
});

test("nonsense finds nothing", () => {
  assert.equal(top("qwzx"), null);
});

test("query variants keep the original first and stay bounded", () => {
  const variants = queryVariants("I need cbc test");
  assert.equal(variants[0], "i need cbc test");
  assert.ok(variants.includes("hemogram"));
  assert.ok(variants.length <= 8);
});
