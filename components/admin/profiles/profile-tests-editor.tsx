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
  // Included tests are listed first. The order is taken when the editor
  // opens and each time the search changes — not on every tick, so a row
  // never jumps away from under the cursor.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(initial.map((entry) => entry.testId)));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = normalized
      ? tests.filter((test) => `${test.code} ${test.officialName}`.toLowerCase().includes(normalized))
      : tests;
    return [...matching].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }, [tests, query, pinned]);

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

  const included = tests.filter((test) => selected.has(test.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">Included ({included.length}):</span>{" "}
        <span className="text-muted-foreground">
          {included.length > 0 ? included.map((test) => test.officialName).join(", ") : "nothing yet"}
        </span>
      </div>
      <Input
        placeholder="Search tests…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPinned(new Set(selected.keys()));
        }}
      />

      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-border/50 p-2">
        {filtered.map((test) => {
          const included = selected.has(test.id);
          return (
            <li key={test.id} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
              <Checkbox checked={included} onCheckedChange={(checked) => toggleIncluded(test.id, checked)} />
              <span className="flex-1">
                {test.officialName} <span className="text-muted-foreground">({test.code})</span>
                {test.testType === "component" || test.testType === "calculated" ? (
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground uppercase">
                    {test.testType === "component" ? "Component" : "Calculated · free"}
                  </span>
                ) : null}
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
