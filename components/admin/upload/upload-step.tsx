"use client";

import { useRef, useState } from "react";
import { CheckIcon, FileSpreadsheetIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// One numbered card in an upload flow (1. get the file → 2. upload →
// 3. review). A step that can't start yet is dimmed; a finished one shows a tick.
export function UploadStep({
  number,
  title,
  description,
  state = "active",
  children,
}: {
  number: number;
  title: string;
  description?: React.ReactNode;
  state?: "active" | "done" | "waiting";
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex gap-4 rounded-2xl border border-border bg-card p-5 transition-opacity",
        state === "waiting" && "opacity-55"
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
          state === "done" ? "bg-success/15 text-success-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {state === "done" ? <CheckIcon className="size-4" /> : number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h2 className="text-[15px] leading-7 font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Drag-and-drop (or click) picker for a single .xlsx file. Shows the chosen
// file with a × to clear it.
export function FileDrop({
  file,
  onFileChange,
  disabled,
  id,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(next: File | null) {
    if (inputRef.current) inputRef.current.value = "";
    onFileChange(next);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
        <FileSpreadsheetIcon className="size-5 shrink-0 text-success-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
        </div>
        <button
          type="button"
          aria-label="Remove file"
          disabled={disabled}
          onClick={() => pick(null)}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files?.[0];
        if (!disabled && dropped) pick(dropped);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-7 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03]",
        dragging && "border-primary bg-primary/[0.05]",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <UploadCloudIcon className="size-6 text-primary" />
      <span className="text-sm font-medium">Drop your Excel file here, or click to choose</span>
      <span className="text-xs text-muted-foreground">.xlsx only</span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".xlsx"
        disabled={disabled}
        onChange={(event) => pick(event.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  );
}
