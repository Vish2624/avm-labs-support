"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Test } from "@/types/test";

export interface ProfileTestSelection {
  testId: string;
  required: boolean;
}

// Assign tests to a profile: a searchable checklist of the catalog, each
// included test individually markable "required" (vs. optional/add-on).
export function ProfileTestsEditor({
  tests,
  initial,
  onSave,
  saving,
}: {
  tests: Test[];
  initial: ProfileTestSelection[];
  onSave: (selection: ProfileTestSelection[]) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Map<string, boolean>>(
    () => new Map(initial.map((entry) => [entry.testId, entry.required]))
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tests;
    return tests.filter((test) => `${test.code} ${test.officialName}`.toLowerCase().includes(normalized));
  }, [tests, query]);

  function toggleIncluded(testId: string, included: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (included) next.set(testId, next.get(testId) ?? true);
      else next.delete(testId);
      return next;
    });
  }

  function toggleRequired(testId: string, required: boolean) {
    setSelected((prev) => new Map(prev).set(testId, required));
  }

  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Search tests…" value={query} onChange={(event) => setQuery(event.target.value)} />

      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
        {filtered.map((test) => {
          const included = selected.has(test.id);
          return (
            <li key={test.id} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
              <Checkbox checked={included} onCheckedChange={(checked) => toggleIncluded(test.id, checked)} />
              <span className="flex-1">
                {test.officialName} <span className="text-muted-foreground">({test.code})</span>
              </span>
              {included ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selected.get(test.id) ?? true}
                    onCheckedChange={(checked) => toggleRequired(test.id, checked)}
                  />
                  Required
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={saving}
        onClick={() =>
          onSave([...selected.entries()].map(([testId, required]) => ({ testId, required })))
        }
      >
        {saving ? "Saving…" : "Save tests"}
      </Button>
    </div>
  );
}
