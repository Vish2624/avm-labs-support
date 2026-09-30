"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ProfileTable } from "./profile-table";
import { ProfileForm } from "./profile-form";
import { ProfileTestsEditor, type ProfileTestSelection } from "./profile-tests-editor";
import { ProfilePricingEditor, type ProfilePriceFormValues } from "./profile-pricing-editor";
import { PackageContentsEditor } from "./package-contents-editor";
import { PACKAGE_CODE_PREFIX, isPackage } from "@/lib/search/matching/is-package-name";
import type { PackageRoster } from "@/lib/profiles/included-profiles";
import { fetcher } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils";
import type { ProfileWithTestCount } from "@/lib/database/profiles";
import type { ProfilePrice } from "@/types/profile";
import type { ProfileReference } from "@/types/catalog";
import type { Test } from "@/types/test";
import type { Location } from "@/types/location";
import type { ProfileInput } from "@/lib/validation/profile-schema";

type Tab = "details" | "tests" | "pricing";

// Admin → Profiles and Admin → Packages. Both live in the `profiles` table;
// a package is one coded PKG-… (isPackage), built from whole profiles plus
// extra tests.
export function ProfilesClient({
  tests,
  locations,
  mode = "profile",
  profileRosters = [],
}: {
  tests: Test[];
  locations: Location[];
  mode?: "profile" | "package";
  /** Package mode: the profiles a package can be built from. */
  profileRosters?: PackageRoster[];
}) {
  const isPackageMode = mode === "package";
  const noun = isPackageMode ? "package" : "profile";
  const { data, mutate } = useSWR<{ profiles: ProfileWithTestCount[] }>("/api/admin/profiles", fetcher);
  const profiles = (data?.profiles ?? []).filter((profile) => isPackage(profile) === isPackageMode);

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? profiles.filter((profile) => `${profile.code} ${profile.name}`.toLowerCase().includes(normalizedQuery))
    : profiles;

  const [editing, setEditing] = useState<ProfileWithTestCount | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [detail, setDetail] = useState<{
    testSelections: ProfileTestSelection[];
    prices: ProfilePrice[];
    references: ProfileReference[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadDetail(profileId: string) {
    try {
      const response = await fetch(`/api/admin/profiles/${profileId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not load profile.");
      setDetail({ testSelections: body.testSelections, prices: body.prices, references: body.references });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function openEdit(profile: ProfileWithTestCount) {
    setEditing(profile);
    setTab("details");
    setDetail(null);
    await loadDetail(profile.id);
  }

  async function handleSaveDetails(raw: ProfileInput) {
    // The code is what makes it a package (PKG-…) or a profile (isPackage), so keep it on the right side.
    let input = { ...raw, code: raw.code.trim().toUpperCase() };
    if (isPackageMode && !isPackage(input)) {
      input = { ...input, code: `${PACKAGE_CODE_PREFIX}${input.code}` };
      toast.info(`Code set to ${input.code} — package codes start with ${PACKAGE_CODE_PREFIX}.`);
    } else if (!isPackageMode && isPackage(input)) {
      toast.error(`A profile's code can't start with ${PACKAGE_CODE_PREFIX} or its name include "Package" — create it under Admin → Packages.`);
      return;
    }
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/profiles/${editing.id}` : "/api/admin/profiles";
      const body = editing ? { action: "update", ...input } : input;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody?.error ?? "Could not save profile.");

      toast.success(editing ? "Saved" : `Created — now add its ${isPackageMode ? "profiles and tests" : "tests"}.`);
      await mutate();
      if (editing) {
        setEditing(null);
      } else {
        // Keep the dialog open on the new profile, on its contents, so the admin can fill it in immediately.
        setCreating(false);
        await openEdit(responseBody.profile);
        setTab("tests");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(profile: ProfileWithTestCount, active: boolean) {
    try {
      const response = await fetch(`/api/admin/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not update profile.");
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleSaveTests(selection: ProfileTestSelection[]) {
    if (!editing) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/profiles/${editing.id}/tests`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests: selection }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not save tests.");
      toast.success("Tests updated — check the price, the reference total has changed");
      await mutate();
      // Reload so the pricing tab's reference sum and TAT reflect the new test list.
      await loadDetail(editing.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePrice(values: ProfilePriceFormValues) {
    if (!editing) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/profiles/${editing.id}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not save price.");
      toast.success("Price updated");
      setDetail((prev) =>
        prev ? { ...prev, prices: [...prev.prices.filter((p) => p.id !== body.price.id), body.price] } : prev
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePriceAction(body: Record<string, unknown>, success: string) {
    if (!editing) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/profiles/${editing.id}/prices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseBody?.error ?? "Could not update pricing.");
      toast.success(success);
      await loadDetail(editing.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const dialogOpen = creating || editing !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search profiles…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          onClick={() => {
            setCreating(true);
            setTab("details");
          }}
        >
          <PlusIcon /> New {noun}
        </Button>
      </div>

      <ProfileTable profiles={filtered} noun={noun} onEdit={openEdit} onToggleActive={handleToggleActive} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            // Contents never make the popup wider than the screen; long ones scroll down.
            "max-h-[90svh] overflow-x-hidden overflow-y-auto [&>*]:min-w-0",
            isPackageMode ? "sm:max-w-3xl" : "sm:max-w-2xl"
          )}
        >
          <DialogHeader>
            <DialogTitle>{editing ? `${editing.name} (${editing.code})` : `New ${noun}`}</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="tests" disabled={!editing}>
                {isPackageMode ? "Profiles & tests" : "Tests"}
              </TabsTrigger>
              <TabsTrigger value="pricing" disabled={!editing}>
                Pricing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-3">
              <ProfileForm
                key={editing?.id ?? "new"}
                initial={editing ? { code: editing.code, name: editing.name, description: editing.description } : undefined}
                onSubmit={handleSaveDetails}
                submitting={submitting}
              />
            </TabsContent>

            <TabsContent value="tests" className="mt-3">
              {editing && detail && isPackageMode ? (
                <PackageContentsEditor
                  key={editing.id}
                  tests={tests.filter((test) => test.testType !== "parameter")}
                  profiles={profileRosters.filter((roster) => roster.id !== editing.id)}
                  initial={detail.testSelections}
                  onSave={handleSaveTests}
                  saving={submitting}
                />
              ) : editing && detail ? (
                <ProfileTestsEditor
                  key={editing.id}
                  // Parameters live inside their component — a profile includes the component instead.
                  tests={tests.filter((test) => test.testType !== "parameter")}
                  initial={detail.testSelections}
                  onSave={handleSaveTests}
                  saving={submitting}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="pricing" className="mt-3">
              {editing && detail ? (
                <ProfilePricingEditor
                  locations={locations}
                  prices={detail.prices}
                  references={detail.references}
                  onSave={handleSavePrice}
                  onRemove={(locationId, serviceType) =>
                    void handlePriceAction({ action: "remove", locationId, serviceType }, "Price removed")
                  }
                  onMove={(to) =>
                    void handlePriceAction({ action: "moveServiceType", to }, `Moved to ${to === "outsource" ? "Outsourced" : "In-House"}`)
                  }
                  saving={submitting}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
