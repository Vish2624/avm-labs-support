"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileInput } from "@/lib/validation/profile-schema";

const EMPTY: ProfileInput = { code: "", name: "", description: null };

// Add/update a profile's own record (code, name, description). Which tests
// it bundles and its pricing are separate concerns — see
// ProfileTestsEditor and the profile pricing table.
export function ProfileForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: ProfileInput;
  onSubmit: (input: ProfileInput) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<ProfileInput>(initial ?? EMPTY);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
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
        <Label htmlFor="profile-code">Code</Label>
        <Input id="profile-code" value={values.code} onChange={(event) => set("code", event.target.value)} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" value={values.name} onChange={(event) => set("name", event.target.value)} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-description">Description</Label>
        <Textarea
          id="profile-description"
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
