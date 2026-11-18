import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSamples, sampleForTest, sampleLabel } from "@/lib/ai-assistant/sample-guide";

test("a blood test uses the tube set on the website", () => {
  assert.equal(sampleForTest("XYZ", "Some Test", "Blood", "Heparin")?.tube, "Heparin");
  assert.equal(sampleLabel(sampleForTest("XYZ", "Some Test", "Blood", "Heparin")!), "Blood, Heparin tube (green top)");
});

test("without a tube from the website, the usual one by lab practice", () => {
  assert.equal(sampleForTest("XYZ", "Random Blood Sugar", "Blood", null)?.tube, "Fluoride");
  assert.equal(sampleForTest("XYZ", "Some Test", "Blood")?.tube, "Serum");
  assert.equal(sampleForTest("XYZ", "Some Test", "Blood", "Purple")?.tube, "Serum");
});

test("only blood has a tube", () => {
  assert.equal(sampleForTest("XYZ", "Urine Routine", "Urine", "EDTA")?.tube, null);
  assert.equal(sampleForTest("XYZ", "Some Test", null, "EDTA"), null);
});

test("samples merge by tube, blood tubes first", () => {
  const merged = mergeSamples([
    sampleForTest("U", "Urine Routine", "Urine")!,
    sampleForTest("A", "Test A", "Blood", "Heparin")!,
    sampleForTest("B", "Test B", "Blood", "EDTA")!,
    sampleForTest("C", "Test C", "Blood", "Heparin")!,
  ]);
  assert.deepEqual(
    merged.map((s) => [s.tube ?? s.specimen, s.tests]),
    [
      ["EDTA", ["Test B"]],
      ["Heparin", ["Test A", "Test C"]],
      ["Urine", ["Urine Routine"]],
    ]
  );
});
