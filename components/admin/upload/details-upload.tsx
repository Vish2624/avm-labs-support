"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadPreview } from "@/lib/imports/upload-preview";

async function postFile(kind: "tests" | "profiles", file: File, mode: "preview" | "apply") {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  const response = await fetch(`/api/admin/uploads/${kind}`, { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as { preview?: UploadPreview; error?: string; applied?: boolean } | null;
  if (!response.ok && !body?.preview) throw new Error(body?.error ?? "Upload failed.");
  return body!;
}

// Test details / Profiles upload: download a template (or the current data
// in the same format), pick a file, review every change, then confirm.
// Nothing is saved until "Apply"; a file with errors can't be applied.
export function DetailsUpload({ kind, description }: { kind: "tests" | "profiles"; description: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [busy, setBusy] = useState<"reading" | "applying" | null>(null);
  const [applied, setApplied] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    setApplied(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setApplied(false);
    if (!next) return;
    setBusy("reading");
    try {
      setPreview((await postFile(kind, next, "preview")).preview ?? null);
    } catch (error) {
      toast.error((error as Error).message);
      reset();
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!file) return;
    setBusy("applying");
    try {
      const result = await postFile(kind, file, "apply");
      setPreview(result.preview ?? null);
      if (result.applied) {
        setApplied(true);
        toast.success("Upload applied — search picks up the changes within a minute.");
      } else {
        toast.error(result.error ?? "Nothing was saved.");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const label = kind === "tests" ? "test details" : "profiles";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/admin/uploads/${kind}/template`} />}>
          <DownloadIcon />
          Download template
        </Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/admin/uploads/${kind}/template?current=1`} />}>
          <FileSpreadsheetIcon />
          Download current {label}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={busy !== null}
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:text-sm file:font-medium file:text-primary"
        />
        {busy === "reading" ? <span className="text-sm text-muted-foreground">Checking the file…</span> : null}
      </div>

      {preview ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          {applied ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success-foreground">
              <CheckCircle2Icon className="size-4" /> Applied. Here&apos;s what was saved.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-[12.5px]">
            {preview.stats.map((stat) => (
              <span
                key={stat.label}
                className={cn("rounded-full px-2.5 py-1", stat.value > 0 && stat.label !== "Rows read" && stat.label.indexOf("Unchanged") === -1 ? "bg-primary/10 font-medium text-primary" : "bg-muted")}
              >
                {stat.value} {stat.label.toLowerCase()}
              </span>
            ))}
          </div>

          {preview.errors.length > 0 ? (
            <IssueList
              tone="error"
              title={`${preview.errors.length} error${preview.errors.length === 1 ? "" : "s"} — fix these in the file and upload it again. Nothing will be saved.`}
              issues={preview.errors}
            />
          ) : null}
          {preview.warnings.length > 0 ? (
            <IssueList tone="warning" title={`${preview.warnings.length} to check`} issues={preview.warnings} />
          ) : null}

          {preview.changes.map((group) => (
            <details key={group.title} className="rounded-lg border border-border/70" open={group.total <= 10}>
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {group.title} <span className="font-normal text-muted-foreground">({group.total})</span>
              </summary>
              <ul className="max-h-56 overflow-y-auto border-t border-border/70 px-3 py-1.5 text-[12.5px]">
                {group.lines.map((line, i) => (
                  <li key={i} className="py-0.5 font-mono">{line}</li>
                ))}
                {group.total > group.lines.length ? (
                  <li className="py-0.5 text-muted-foreground">…and {group.total - group.lines.length} more</li>
                ) : null}
              </ul>
            </details>
          ))}

          {!applied && preview.errors.length === 0 && !preview.canApply ? (
            <p className="text-sm text-muted-foreground">Nothing to change — the file matches the current data.</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={busy !== null}>
              {applied ? "Upload another file" : "Cancel"}
            </Button>
            {!applied ? (
              <Button onClick={handleApply} disabled={busy !== null || !preview.canApply}>
                {busy === "applying" ? "Applying…" : "Apply changes"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IssueList({ tone, title, issues }: { tone: "error" | "warning"; title: string; issues: { row: number; message: string }[] }) {
  const Icon = tone === "error" ? XCircleIcon : AlertTriangleIcon;
  return (
    <div className={cn("rounded-lg px-3 py-2 text-[12.5px]", tone === "error" ? "bg-destructive/10" : "bg-warning/15")}>
      <p className={cn("mb-1 flex items-center gap-1.5 font-medium", tone === "error" ? "text-destructive" : "text-warning-foreground")}>
        <Icon className="size-4" /> {title}
      </p>
      <ul className="max-h-48 overflow-y-auto">
        {issues.slice(0, 100).map((issue, i) => (
          <li key={i} className="py-0.5">
            {issue.row > 0 ? <span className="text-muted-foreground">Row {issue.row}: </span> : null}
            {issue.message}
          </li>
        ))}
        {issues.length > 100 ? <li className="py-0.5 text-muted-foreground">…and {issues.length - 100} more</li> : null}
      </ul>
    </div>
  );
}
