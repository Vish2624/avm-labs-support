"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TestTable } from "./test-table";
import { TestForm } from "./test-form";
import { TestDetails } from "./test-details";
import { fetcher } from "@/lib/utils/fetcher";
import type { Test, TestAlias } from "@/types/test";
import type { TestPrice } from "@/types/price";
import type { Location } from "@/types/location";
import type { TestInput } from "@/lib/validation/test-schema";

export function TestsClient({ locations }: { locations: Location[] }) {
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  const { data, mutate } = useSWR<{ tests: Test[] }>("/api/admin/tests", fetcher);
  const tests = data?.tests ?? [];

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? tests.filter((test) => `${test.code} ${test.officialName} ${test.category ?? ""}`.toLowerCase().includes(normalizedQuery))
    : tests;

  const [editing, setEditing] = useState<Test | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<{ aliases: TestAlias[]; prices: TestPrice[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function openEdit(test: Test) {
    setEditing(test);
    setDetail(null);
    try {
      const response = await fetch(`/api/admin/tests/${test.id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not load test.");
      setDetail({ aliases: body.aliases, prices: body.prices });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleSave(input: TestInput) {
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/tests/${editing.id}` : "/api/admin/tests";
      const body = editing ? { action: "update", ...input } : input;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody?.error ?? "Could not save test.");

      toast.success(editing ? "Test updated." : "Test created.");
      setEditing(null);
      setCreating(false);
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(test: Test, active: boolean) {
    try {
      const response = await fetch(`/api/admin/tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not update test.");
      toast.success(`${test.officialName} ${active ? "activated" : "deactivated"}.`);
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const dialogOpen = creating || editing !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search tests…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => setCreating(true)}>
          <PlusIcon /> New test
        </Button>
      </div>

      <TestTable tests={filtered} onView={openEdit} onToggleActive={handleToggleActive} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New test"}</DialogTitle>
          </DialogHeader>
          <TestForm
            key={editing?.id ?? "new"}
            initial={
              editing
                ? {
                    code: editing.code,
                    officialName: editing.officialName,
                    shortName: editing.shortName,
                    category: editing.category,
                    description: editing.description,
                  }
                : undefined
            }
            onSubmit={handleSave}
            submitting={submitting}
          />
          {editing && detail ? (
            <TestDetails aliases={detail.aliases} prices={detail.prices} locationsById={locationsById} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
