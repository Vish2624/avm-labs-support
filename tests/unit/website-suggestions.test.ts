import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteSuggestions, type SuggestionProfile, type SuggestionTest } from "@/lib/profiles/website-suggestions";

// Dummy tests and profiles (minor units), never real AVM data.
const TESTS: SuggestionTest[] = [
  { id: "a", price: 5000, categories: ["thyroid"] },
  { id: "b", price: 4000, categories: ["thyroid"] },
  { id: "c", price: 3000, categories: ["routine"] },
  { id: "d", price: 10000, categories: ["vitamins"] },
];
const profile = (
  id: string,
  price: number,
  testIds: string[],
  extra: Partial<SuggestionProfile> = {}
): SuggestionProfile => ({
  id,
  price,
  testIds,
  category: "wellness",
  recommended: false,
  ...extra,
});
const rules = { minBill: 1500, homeCollectionFreeFrom: 18000 };
const run = (quoteTestIds: string[], profiles: SuggestionProfile[], quoteProfileIds: string[] = []) =>
  websiteSuggestions({ quoteTestIds, quoteProfileIds, tests: TESTS, profiles, rules });
const picks = (...args: Parameters<typeof run>) => run(...args).filter((s) => s.pick);

test("a profile that costs less than the tests it replaces is a saving, first", () => {
  const [first, second] = run(["a", "b"], [profile("more", 12000, ["a", "d"]), profile("save", 8000, ["a", "b", "c"])]);
  assert.equal(first.profileId, "save");
  assert.equal(first.extra, -1000);
  assert.deepEqual(first.replacesTestIds, ["a", "b"]);
  assert.deepEqual(first.extraTestIds, ["c"]);
  // a, b on the quote (9000); "more" replaces a: 9000 - 5000 + 12000 = 16000, 7000 more for d worth 10000.
  assert.equal(second.profileId, "more");
  assert.equal(second.extra, 7000);
  assert.equal(second.worth, 10000);
});

test("a dearer profile isn't a pick when its extra tests aren't worth the difference", () => {
  assert.deepEqual(picks(["a"], [profile("p", 20000, ["a", "c"])]), []);
});

test("single-purpose profiles are picked only when they cost less", () => {
  assert.deepEqual(picks(["a", "b"], [profile("kids", 9000, ["a", "b", "c"], { category: "kids" })]), []);
  assert.equal(picks(["a", "b"], [profile("kids", 8000, ["a", "b", "c"], { category: "kids" })]).length, 1);
});

test("a profile with exactly the quoted tests at the same price is a pick", () => {
  const [s] = run(["a", "b"], [profile("same", 9000, ["a", "b"])]);
  assert.equal(s.pick, true);
  assert.equal(s.extra, 0);
  assert.deepEqual(s.extraTestIds, []);
});

test("a same-price profile covering only some quoted tests isn't a pick", () => {
  assert.deepEqual(picks(["a", "c"], [profile("part", 5000, ["a"])]), []);
});

test("every other profile containing quoted tests follows the picks, most of the quote first, then cheapest", () => {
  const out = run(
    ["a", "b"],
    [
      profile("one-dear", 30000, ["a", "d"]),
      profile("save", 8000, ["a", "b", "c"]),
      profile("both", 40000, ["a", "b", "d"]),
      profile("one-cheap", 20000, ["a", "c"]),
      profile("unrelated", 1000, ["d"]),
    ]
  );
  assert.deepEqual(
    out.map((s) => [s.profileId, s.pick]),
    [
      ["save", true],
      ["both", false],
      ["one-cheap", false],
      ["one-dear", false],
    ]
  );
});

test("a profile sharing tests with one staying on the quote isn't suggested", () => {
  const onQuote = profile("q", 6000, ["b", "c"]);
  assert.deepEqual(run(["a"], [onQuote, profile("p", 4000, ["a", "b"])], ["q"]), []);
});

test("a profile wholly containing one on the quote replaces it", () => {
  const small = profile("small", 6000, ["a", "b"]);
  const [s] = run([], [small, profile("big", 7000, ["a", "b", "c"])], ["small"]);
  assert.equal(s.profileId, "big");
  assert.deepEqual(s.replacesProfileIds, ["small"]);
  assert.equal(s.extra, 1000);
});

test("Recommended profiles come first among equally good ones", () => {
  const out = run(
    ["a", "b"],
    [profile("plain", 8000, ["a", "b", "c"]), profile("rec", 8000, ["a", "b", "d"], { recommended: true })]
  );
  assert.deepEqual(
    out.map((s) => s.profileId),
    ["rec", "plain"]
  );
});

test("minimum billing is counted on both sides", () => {
  // Quote: c alone, below a 5000 minimum: the customer already pays 5000, so a 4500 profile isn't a saving of 3000-4500.
  const out = websiteSuggestions({
    quoteTestIds: ["c"],
    quoteProfileIds: [],
    tests: TESTS,
    profiles: [profile("p", 4500, ["c", "b"])],
    rules: { minBill: 5000, homeCollectionFreeFrom: 18000 },
  });
  assert.equal(out[0].extra, 0);
  assert.deepEqual(out[0].extraTestIds, ["b"]);
});
