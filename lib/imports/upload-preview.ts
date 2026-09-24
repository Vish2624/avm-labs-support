import type { UploadIssue } from "./upload-values";

/** How many example lines each change group carries back to the preview. */
export const PREVIEW_SAMPLE_SIZE = 25;

/**
 * What an upload would do, shown to the admin before anything is saved —
 * shared by the test-details and profile uploads so one preview UI renders
 * both (components/admin/upload/details-upload.tsx).
 */
export interface UploadPreview {
  /** Any error blocks the whole upload; nothing is saved. */
  errors: UploadIssue[];
  /** Worth a look, but the upload can still be applied. */
  warnings: UploadIssue[];
  stats: { label: string; value: number }[];
  /** Grouped example changes, e.g. "New tests": ["TSH — THYROID STIMULATING HORMONE", …]. */
  changes: { title: string; total: number; lines: string[] }[];
  /** True when there are no errors and at least one change to apply. */
  canApply: boolean;
}

export function changeGroup(title: string, lines: string[]): UploadPreview["changes"][number] {
  return { title, total: lines.length, lines: lines.slice(0, PREVIEW_SAMPLE_SIZE) };
}
