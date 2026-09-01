import { Loader2Icon } from "lucide-react";

// Upload/parse progress indicator, shown while /api/imports/validate runs.
export function UploadProgress() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      Uploading and validating…
    </div>
  );
}
