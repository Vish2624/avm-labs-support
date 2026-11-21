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

test("a profile with a test that can't be booked with one staying on the quote isn't suggested", () => {
  const tests: SuggestionTest[] = [
    ...TESTS,
    { id: "fasting", websiteId: "fbs", price: 1000, categories: ["diabetes"] },
    { id: "random", websiteId: "rbs", price: 1000, categories: ["diabetes"] },
  ];
  const profiles = [profile("sugar", 5000, ["a", "fasting"]), profile("plain", 5000, ["a", "c"])];
  const suggest = (quoteTestIds: string[]) =>
    websiteSuggestions({ quoteTestIds, quoteProfileIds: [], tests, profiles, rules }).map((s) => s.profileId);
  assert.ok(suggest(["a"]).includes("sugar"));
  assert.deepEqual(suggest(["a", "random"]), ["plain"]);
  // Swapping fasting for fasting is fine.
  assert.ok(suggest(["a", "fasting"]).includes("sugar"));
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

test("a profile with everything on the quote that saves most comes before one adding tests", () => {
  // a, b, c on the quote (12000). "own" has exactly them for 8000; "bigger" adds d (worth 10000) and saves less.
  const [first, second] = run(["a", "b", "c"], [profile("bigger", 11000, ["a", "b", "c", "d"]), profile("own", 8000, ["a", "b", "c"])]);
  assert.equal(first.profileId, "own");
  assert.equal(second.profileId, "bigger");
});

test("a profile with everything on the quote comes before one saving more on only part of it", () => {
  // "part" replaces a, b for 3000 (saves 6000, c stays); "whole" has a, b, c for 9000 (saves 3000).
  const [first] = run(["a", "b", "c"], [profile("part", 3000, ["a", "b"], { recommended: true }), profile("whole", 9000, ["a", "b", "c"])]);
  assert.equal(first.profileId, "whole");
});

test("the profile taking the most of the quote comes first however much more it costs; on a tie, the cheapest", () => {
  // a, c on the quote (8000). "all" has both plus b, d (worth 14000) for 13000 more: past 1.5x the quote, still first.
  const out = websiteSuggestions({
    quoteTestIds: ["a", "c"],
    quoteProfileIds: [],
    tests: TESTS,
    profiles: [profile("c-dear", 9000, ["c", "b", "d"]), profile("all", 21000, ["a", "b", "c", "d"]), profile("c-cheap", 6000, ["c", "b"])],
    rules: { minBill: 1500, homeCollectionFreeFrom: 0 },
  });
  assert.deepEqual(
    out.map((s) => [s.profileId, s.pick]),
    [
      ["all", true],
      ["c-cheap", true],
      ["c-dear", true],
    ]
  );
});

const SEXED_TESTS: SuggestionTest[] = [
  ...TESTS,
  { id: "psa", websiteId: "psa", price: 6000, categories: ["tumour"] },
  { id: "amh", websiteId: "amh", price: 9000, categories: ["hormones"] },
];
const runSexed = (quoteTestIds: string[], profiles: SuggestionProfile[], quoteProfileIds: string[] = []) =>
  websiteSuggestions({ quoteTestIds, quoteProfileIds, tests: SEXED_TESTS, profiles, rules });

test("a men's profile that would add PSA isn't suggested while the quote doesn't show whose it is", () => {
  const men = profile("men", 8000, ["a", "b", "c", "psa"], { category: "men" });
  assert.deepEqual(runSexed(["a", "b", "c"], [men]), []);
  // The quote already has a men's-only test: fine.
  assert.equal(runSexed(["a", "b", "psa"], [men])[0]?.profileId, "men");
});

test("a men's profile is never suggested for a women's quote, or the reverse", () => {
  const men = profile("men", 4000, ["a", "b"], { category: "men" });
  const women = profile("women", 4000, ["a", "b"], { category: "women" });
  assert.deepEqual(runSexed(["a", "b", "amh"], [men]).map((s) => s.profileId), []);
  assert.deepEqual(runSexed(["a", "b", "psa"], [women]).map((s) => s.profileId), []);
  // No sign of whose quote it is, and nothing sex-specific added: both are fine.
  assert.equal(runSexed(["a", "b"], [men, women]).length, 2);
});
