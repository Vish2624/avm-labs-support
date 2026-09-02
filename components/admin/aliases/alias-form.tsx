"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TestSelect } from "@/components/admin/test-select";
import { ALIAS_TYPES, ALIAS_TYPE_LABELS, type AliasType } from "@/lib/constants/alias-types";
import type { AliasInput } from "@/lib/validation/alias-schema";
import type { Test } from "@/types/test";

const EMPTY: AliasInput = { testId: "", alias: "", aliasType: "customer_term", confidence: 100 };

// Add/update one alias mapping: which test it resolves to, the alias text
// itself, its type, and a confidence score used only to break ranking ties
// (never to invent a match — see lib/search/search-tests.ts).
export function AliasForm({
  tests,
  initial,
  onSubmit,
  submitting,
}: {
  tests: Test[];
  initial?: AliasInput;
  onSubmit: (input: AliasInput) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<AliasInput>(initial ?? EMPTY);

  function set<K extends keyof AliasInput>(key: K, value: AliasInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label>Test</Label>
        <TestSelect tests={tests} value={values.testId} onChange={(testId) => set("testId", testId)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alias-text">Alias text</Label>
        <Input id="alias-text" value={values.alias} onChange={(event) => set("alias", event.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={values.aliasType} onValueChange={(next) => next && set("aliasType", next as AliasType)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(value: string) => ALIAS_TYPE_LABELS[value as AliasType] ?? "Select type"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ALIAS_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ALIAS_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alias-confidence">Confidence (0-100)</Label>
          <Input
            id="alias-confidence"
            type="number"
            min={0}
            max={100}
            value={values.confidence}
            onChange={(event) => set("confidence", Number(event.target.value))}
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting || !values.testId} className="w-fit">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
