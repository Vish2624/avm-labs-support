"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { includedProfiles, type PackageRoster } from "@/lib/profiles/included-profiles";
import type { ProfileTestSelection } from "./profile-tests-editor";
import type { Test } from "@/types/test";

// Build a package from whole profiles plus extra tests. A package is saved
// as its full test list (every picked profile's tests + the extras), so the
// Packages page, the quote and the reply work as for any profile; on
// reopening, the profiles it fully contains are recognised again.
export function PackageContentsEditor({
  tests,
  profiles,
  initial,
  onSave,
  saving,
}: {
  /** Orderable tests, components and calculated parameters (no parameters). */
  tests: Test[];
  profiles: PackageRoster[];
  initial: ProfileTestSelection[];
  onSave: (selection: ProfileTestSelection[]) => void;
  saving: boolean;
}) {
  const [profileIds, setProfileIds] = useState<Set<string>>(() => {
    const ids = initial.map((entry) => entry.testId);
    return new Set(includedProfiles(ids, profiles).map((p) => p.id));
  });
  const [extraIds, setExtraIds] = useState<Set<string>>(() => {
    const ids = initial.map((entry) => entry.testId);
    const covered = new Set(includedProfiles(ids, profiles).flatMap((p) => p.testIds));
    return new Set(ids.filter((id) => !covered.has(id)));
  });
  const [profileQuery, setProfileQuery] = useState("");
  const [testQuery, setTestQuery] = useState("");
  // Ticked profiles and tests are listed first. The order is taken when the
  // editor opens and each time that list's search changes — not on every
  // tick, so a row never jumps away from under the cursor.
  const [pinnedProfiles, setPinnedProfiles] = useState<Set<string>>(() => new Set(profileIds));
  const [pinnedTests, setPinnedTests] = useState<Set<string>>(() => new Set(initial.map((entry) => entry.testId)));

  const testById = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);
  const chosenProfiles = profiles.filter((p) => profileIds.has(p.id));
  // Which chosen profile already brings each test in.
  const coveredBy = new Map<string, string>();
  for (const profile of chosenProfiles) for (const id of profile.testIds) if (!coveredBy.has(id)) coveredBy.set(id, profile.name);
  const extras = [...extraIds].filter((id) => !coveredBy.has(id));
  const allTestIds = [...new Set([...coveredBy.keys(), ...extras])];
  const dirty = allTestIds.slice().sort().join("|") !== initial.map((e) => e.testId).sort().join("|");

  const matches = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const pinnedFirst = (pinned: Set<string>) => (a: { id: string }, b: { id: string }) =>
    Number(pinned.has(b.id)) - Number(pinned.has(a.id));
  const shownProfiles = profiles
    .filter((p) => !profileQuery.trim() || matches(`${p.code} ${p.name}`, profileQuery))
    .sort(pinnedFirst(pinnedProfiles));
  const shownTests = tests
    .filter((t) => !testQuery.trim() || matches(`${t.code} ${t.officialName} ${t.shortName ?? ""}`, testQuery))
    .sort(pinnedFirst(pinnedTests));

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">This package: </span>
        {chosenProfiles.length === 0 && extras.length === 0 ? (
          <span className="text-muted-foreground">nothing yet — tick profiles and tests below.</span>
        ) : (
          <span className="text-muted-foreground">
            {[
              ...chosenProfiles.map((p) => p.name),
              ...(extras.length ? [`${extras.length} extra test${extras.length === 1 ? "" : "s"}`] : []),
            ].join(" + ")}{" "}
            = <span className="font-medium text-foreground">{allTestIds.length} tests</span>
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Profiles</p>
          <Input placeholder="Search profiles…" value={profileQuery} onChange={(event) => {
              setProfileQuery(event.target.value);
              setPinnedProfiles(new Set(profileIds));
            }} />
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border/50 p-1.5">
            {shownProfiles.length === 0 ? <li className="p-2 text-sm text-muted-foreground">No profiles.</li> : null}
            {shownProfiles.map((profile) => (
              <li key={profile.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={profileIds.has(profile.id)}
                    onCheckedChange={(checked) => setProfileIds((prev) => toggle(prev, profile.id, checked))}
                  />
                  <span className="flex-1">{profile.name}</span>
                  <span className="text-xs text-muted-foreground">{profile.testIds.length} tests</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Extra tests</p>
          <Input placeholder="Search tests…" value={testQuery} onChange={(event) => {
              setTestQuery(event.target.value);
              setPinnedTests(new Set(allTestIds));
            }} />
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border/50 p-1.5">
            {shownTests.map((test) => {
              const via = coveredBy.get(test.id);
              return (
                <li key={test.id}>
                  <label
                    className={`flex items-center gap-2 rounded-md p-1.5 text-sm ${via ? "opacity-60" : "cursor-pointer hover:bg-muted/50"}`}
                  >
                    <Checkbox
                      checked={Boolean(via) || extraIds.has(test.id)}
                      disabled={Boolean(via)}
                      onCheckedChange={(checked) => setExtraIds((prev) => toggle(prev, test.id, checked))}
                    />
                    <span className="flex-1">
                      {test.officialName}
                      {test.testType === "calculated" ? (
                        <span className="ml-1.5 text-[10.5px] font-semibold text-muted-foreground uppercase">Calculated · free</span>
                      ) : null}
                    </span>
                    {via ? <span className="text-xs text-muted-foreground">in {via}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {extras.some((id) => !testById.has(id)) ? (
        <p className="text-xs text-destructive">Some tests in this package are no longer in the catalog; saving drops them.</p>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={saving || !dirty || allTestIds.length === 0}
        onClick={() => onSave(allTestIds.filter((id) => testById.has(id)).map((testId) => ({ testId, required: true })))}
      >
        {saving ? "Saving…" : "Save package contents"}
      </Button>
    </div>
  );
}
