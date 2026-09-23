"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ImportSummary {
  rowCount: number;
  matchedTests: number;
  newAliases: number;
  alreadyCovered: number;
  unknownCodes: string[];
  sample: { testCode: string; testName: string; alias: string }[];
}

async function postFile(file: File, mode: "preview" | "commit") {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  const response = await fetch("/api/admin/aliases/import", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Import failed.");
  return body as { summary: ImportSummary; inserted?: number };
}

// Bulk-add aliases from a test-catalog workbook ("Test Code" + "Aliases"
// columns, comma-separated). Preview first, then import — only new aliases
// are added; existing ones and unknown test codes are skipped, never guessed.
export function AliasImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setSummary(null);
    setBusy(false);
  }

  async function handleFile(next: File | null) {
    setFile(next);
    setSummary(null);
    if (!next) return;
    setBusy(true);
    try {
      setSummary((await postFile(next, "preview")).summary);
    } catch (error) {
      toast.error((error as Error).message);
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    try {
      const { inserted } = await postFile(file, "commit");
      toast.success(`Added ${inserted ?? 0} alias${inserted === 1 ? "" : "es"}.`);
      onImported();
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import aliases from Excel</DialogTitle>
          <DialogDescription>
            The first sheet needs a &ldquo;Test Code&rdquo; column and an &ldquo;Aliases&rdquo; column (comma-separated).
            &ldquo;Short Name&rdquo; is added as an alias too. Only new aliases are added.
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:text-sm file:font-medium file:text-primary"
        />

        {busy && !summary ? <p className="text-sm text-muted-foreground">Reading the file…</p> : null}

        {summary ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <span className="rounded-full bg-success/15 px-2.5 py-1 font-medium text-success-foreground">
                {summary.newAliases} new aliases
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1">
                {summary.matchedTests} of {summary.rowCount} tests matched
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1">{summary.alreadyCovered} already covered</span>
              {summary.unknownCodes.length > 0 ? (
                <span className="rounded-full bg-warning/25 px-2.5 py-1 text-warning-foreground">
                  {summary.unknownCodes.length} unknown test codes skipped
                </span>
              ) : null}
            </div>
            {summary.sample.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {summary.sample.map((row, index) => (
                  <div key={index} className="flex justify-between gap-3 border-b border-border/60 px-3 py-1.5 last:border-b-0">
                    <span className="truncate">{row.alias}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.testCode}</span>
                  </div>
                ))}
                {summary.newAliases > summary.sample.length ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">
                    …and {summary.newAliases - summary.sample.length} more
                  </p>
                ) : null}
              </div>
            ) : null}
            {summary.unknownCodes.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Not in the catalog: {summary.unknownCodes.slice(0, 15).join(", ")}
                {summary.unknownCodes.length > 15 ? "…" : ""}
              </p>
            ) : null}
            <Button onClick={handleImport} disabled={busy || summary.newAliases === 0} className="self-end">
              {busy ? "Importing…" : `Import ${summary.newAliases} aliases`}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
