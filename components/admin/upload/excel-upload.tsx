"use client";

import { useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDrop } from "./upload-step";

// File picker + submit for a price list Excel upload. Purely a form — the
// parent orchestrates the actual upload request.
export function ExcelUpload({
  onSubmit,
  submitting,
  targetLabel,
}: {
  onSubmit: (file: File) => void;
  submitting: boolean;
  /** Where the prices will go, e.g. "Dubai · In-House", shown on the button. */
  targetLabel: string;
}) {
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (file) onSubmit(file);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FileDrop id="price-list-file" file={file} onFileChange={setFile} disabled={submitting} />
      <Button type="submit" disabled={!file || submitting} className="w-fit">
        <UploadIcon /> {submitting ? "Checking…" : `Check file for ${targetLabel}`}
      </Button>
    </form>
  );
}
