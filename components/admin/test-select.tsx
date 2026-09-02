"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Test } from "@/types/test";

// Single-test picker, used wherever an admin form needs to link one test
// (e.g. AliasForm). Base UI's SelectValue shows the raw value unless given a
// formatter — see the same fix in components/layout/location-selector.tsx.
export function TestSelect({
  tests,
  value,
  onChange,
}: {
  tests: Test[];
  value: string;
  onChange: (testId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a test">
          {(selectedId: string | null) => {
            const selected = tests.find((test) => test.id === selectedId);
            return selected ? `${selected.code} — ${selected.officialName}` : "Select a test";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {tests.map((test) => (
          <SelectItem key={test.id} value={test.id}>
            {test.code} — {test.officialName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
