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
import { fetcher } from "@/lib/utils/fetcher";
import type { ProfileWithTestCount } from "@/lib/database/profiles";
import type { ProfilePrice } from "@/types/profile";
import type { Test } from "@/types/test";
import type { Location } from "@/types/location";
import type { ProfileInput } from "@/lib/validation/profile-schema";

type Tab = "details" | "tests" | "pricing";

export function ProfilesClient({ tests, locations }: { tests: Test[]; locations: Location[] }) {
  const { data, mutate } = useSWR<{ profiles: ProfileWithTestCount[] }>("/api/admin/profiles", fetcher);
  const profiles = data?.profiles ?? [];

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? profiles.filter((profile) => `${profile.code} ${profile.name}`.toLowerCase().includes(normalizedQuery))
    : profiles;

  const [editing, setEditing] = useState<ProfileWithTestCount | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [detail, setDetail] = useState<{ testSelections: ProfileTestSelection[]; prices: ProfilePrice[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function openEdit(profile: ProfileWithTestCount) {
    setEditing(profile);
    setTab("details");
    setDetail(null);
    try {
      const response = await fetch(`/api/admin/profiles/${profile.id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not load profile.");
      setDetail({ testSelections: body.testSelections, prices: body.prices });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleSaveDetails(input: ProfileInput) {
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

      toast.success(editing ? "Profile updated." : "Profile created — now add its tests and pricing.");
      await mutate();
      if (editing) {
        setEditing(null);
      } else {
        // Keep the dialog open on the new profile so the admin can add tests/pricing immediately.
        setCreating(false);
        openEdit(responseBody.profile);
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
      toast.success("Profile tests updated.");
      await mutate();
      setDetail((prev) => (prev ? { ...prev, testSelections: selection } : prev));
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
      toast.success("Profile price updated.");
      setDetail((prev) =>
        prev ? { ...prev, prices: [...prev.prices.filter((p) => p.id !== body.price.id), body.price] } : prev
      );
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
          <PlusIcon /> New profile
        </Button>
      </div>

      <ProfileTable profiles={filtered} onEdit={openEdit} onToggleActive={handleToggleActive} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New profile"}</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="tests" disabled={!editing}>
                Tests
              </TabsTrigger>
              <TabsTrigger value="pricing" disabled={!editing}>
                Pricing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-3">
              <ProfileForm
                key={editing?.id ?? "new"}
                initial={editing ? { code: editing.code, name: editing.name, description: null } : undefined}
                onSubmit={handleSaveDetails}
                submitting={submitting}
              />
            </TabsContent>

            <TabsContent value="tests" className="mt-3">
              {editing && detail ? (
                <ProfileTestsEditor
                  key={editing.id}
                  tests={tests}
                  initial={detail.testSelections}
                  onSave={handleSaveTests}
                  saving={submitting}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="pricing" className="mt-3">
              {editing && detail ? (
                <ProfilePricingEditor locations={locations} prices={detail.prices} onSave={handleSavePrice} saving={submitting} />
              ) : null}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
