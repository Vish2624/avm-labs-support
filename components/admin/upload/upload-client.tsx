"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon } from "lucide-react";
import { ExcelUpload } from "./excel-upload";
import { UploadProgress } from "./upload-progress";
import { ValidationSummary } from "./validation-summary";
import { ValidationErrors } from "./validation-errors";
import { ImportPreview } from "./import-preview";
import { ImportConfirmation } from "./import-confirmation";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SERVICE_TYPES, type ServiceType } from "@/lib/constants/service-types";
import type { Location } from "@/types/location";
import type { ImportDiff, ImportValidationReport, PriceListVersion } from "@/types/import";

type Stage =
  | { name: "idle" }
  | { name: "uploading" }
  | { name: "validated"; versionId: string; report: ImportValidationReport; diff: ImportDiff }
  | { name: "activating"; versionId: string; report: ImportValidationReport; diff: ImportDiff }
  | { name: "activated"; version: PriceListVersion };

export function UploadClient({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  async function handleUpload(file: File) {
    setStage({ name: "uploading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("locationId", locationId);
      formData.append("serviceType", serviceType);

      const response = await fetch("/api/imports/validate", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Upload failed.");

      setStage({ name: "validated", versionId: body.versionId, report: body.report, diff: body.diff });
    } catch (error) {
      toast.error((error as Error).message);
      setStage({ name: "idle" });
    }
  }

  async function handleActivate() {
    if (stage.name !== "validated") return;
    const { versionId, report, diff } = stage;
    setStage({ name: "activating", versionId, report, diff });

    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Activation failed.");

      toast.success("Import activated.");
      setStage({ name: "activated", version: body.version });
    } catch (error) {
      toast.error((error as Error).message);
      setStage({ name: "validated", versionId, report, diff });
    }
  }

  function reset() {
    setStage({ name: "idle" });
  }

  if (stage.name === "activated") {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>
          Version {stage.version.versionNumber} is now active ({stage.version.recordCount} rows)
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>The previous version for this location and service type has been archived.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reset}>
              Upload another file
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ExcelUpload
        locations={locations}
        locationId={locationId}
        onLocationChange={setLocationId}
        serviceType={serviceType}
        onServiceTypeChange={setServiceType}
        onSubmit={handleUpload}
        submitting={stage.name === "uploading"}
      />

      {stage.name === "uploading" ? <UploadProgress /> : null}

      {stage.name === "validated" || stage.name === "activating" ? (
        <div className="flex flex-col gap-4">
          <ValidationSummary report={stage.report} />
          <ValidationErrors issues={stage.report.issues} />
          <ImportPreview diff={stage.diff} />
          <ImportConfirmation
            canActivate={stage.report.errorCount === 0}
            hasWarnings={stage.report.warningCount > 0}
            activating={stage.name === "activating"}
            onActivate={handleActivate}
          />
          {stage.report.errorCount > 0 ? (
            <Button size="sm" variant="outline" onClick={reset} className="w-fit">
              Try another file
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
