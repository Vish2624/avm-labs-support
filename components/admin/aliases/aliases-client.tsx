"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { AliasTable } from "./alias-table";
import { AliasForm } from "./alias-form";
import { fetcher } from "@/lib/utils/fetcher";
import type { AliasWithTest } from "@/lib/database/aliases";
import type { Test } from "@/types/test";
import type { AliasInput } from "@/lib/validation/alias-schema";

export function AliasesClient({ tests }: { tests: Test[] }) {
  const { data, mutate } = useSWR<{ aliases: AliasWithTest[] }>("/api/admin/aliases", fetcher);
  const aliases = data?.aliases ?? [];

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? aliases.filter((alias) => `${alias.alias} ${alias.testCode} ${alias.testOfficialName}`.toLowerCase().includes(normalizedQuery))
    : aliases;

  const [editing, setEditing] = useState<AliasWithTest | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AliasWithTest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(input: AliasInput) {
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/aliases/${editing.id}` : "/api/admin/aliases";
      const body = editing ? { action: "update", ...input } : input;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody?.error ?? "Could not save alias.");

      toast.success(editing ? "Alias updated." : "Alias created.");
      setEditing(null);
      setCreating(false);
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(alias: AliasWithTest, active: boolean) {
    try {
      const response = await fetch(`/api/admin/aliases/${alias.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not update alias.");
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      const response = await fetch(`/api/admin/aliases/${deleting.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not delete alias.");
      toast.success(`Deleted "${deleting.alias}".`);
      setDeleting(null);
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
          placeholder="Search aliases…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => setCreating(true)}>
          <PlusIcon /> New alias
        </Button>
      </div>

      <AliasTable aliases={filtered} onEdit={setEditing} onToggleActive={handleToggleActive} onDelete={setDeleting} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit "${editing.alias}"` : "New alias"}</DialogTitle>
          </DialogHeader>
          <AliasForm
            key={editing?.id ?? "new"}
            tests={tests}
            initial={
              editing
                ? { testId: editing.testId, alias: editing.alias, aliasType: editing.aliasType, confidence: editing.confidence }
                : undefined
            }
            onSubmit={handleSave}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.alias}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the alias mapping permanently. Searches that relied on it will fall back to fuzzy
              matching only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
