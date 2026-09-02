"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TestInput } from "@/lib/validation/test-schema";

const EMPTY: TestInput = { code: "", officialName: "", shortName: null, category: null, description: null };

// Add/update a test's catalog metadata (code, name, category, description).
// Pricing isn't editable here — it only ever comes from the Excel import
// pipeline (Phase 6) or, for a quick availability-only correction, the
// Admin Availability page.
export function TestForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: TestInput;
  onSubmit: (input: TestInput) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<TestInput>(initial ?? EMPTY);

  function set<K extends keyof TestInput>(key: K, value: TestInput[K]) {
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="test-code">Code</Label>
          <Input id="test-code" value={values.code} onChange={(event) => set("code", event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="test-short-name">Short name</Label>
          <Input
            id="test-short-name"
            value={values.shortName ?? ""}
            onChange={(event) => set("shortName", event.target.value || null)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="test-name">Official name</Label>
        <Input
          id="test-name"
          value={values.officialName}
          onChange={(event) => set("officialName", event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="test-category">Category</Label>
        <Input
          id="test-category"
          value={values.category ?? ""}
          onChange={(event) => set("category", event.target.value || null)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="test-description">Description</Label>
        <Textarea
          id="test-description"
          value={values.description ?? ""}
          onChange={(event) => set("description", event.target.value || null)}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
