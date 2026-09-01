import { CheckCircle2Icon, XCircleIcon, AlertTriangleIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { ImportValidationReport } from "@/types/import";

// Pass/fail summary of an import's validation — one of three states:
// failed (any error, nothing touches live data), validated with warnings
// (needs explicit review before activating), or clean.
export function ValidationSummary({ report }: { report: ImportValidationReport }) {
  const rowWord = `${report.rowCount} row${report.rowCount === 1 ? "" : "s"}`;

  if (report.errorCount > 0) {
    return (
      <Alert variant="destructive">
        <XCircleIcon />
        <AlertTitle>Import failed validation</AlertTitle>
        <AlertDescription>
          {report.errorCount} error{report.errorCount === 1 ? "" : "s"} across {rowWord}. Fix the file and upload again
          — nothing has changed in the live catalog.
        </AlertDescription>
      </Alert>
    );
  }

  if (report.warningCount > 0) {
    return (
      <Alert>
        <AlertTriangleIcon />
        <AlertTitle>Validated with warnings</AlertTitle>
        <AlertDescription>
          {rowWord} passed validation, with {report.warningCount} warning{report.warningCount === 1 ? "" : "s"} to
          review before activating.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <CheckCircle2Icon />
      <AlertTitle>Validated</AlertTitle>
      <AlertDescription>{rowWord} passed validation with no issues.</AlertDescription>
    </Alert>
  );
}
