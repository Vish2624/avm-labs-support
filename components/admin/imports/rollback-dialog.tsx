"use client";

import { useState } from "react";
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
import type { PriceListVersion } from "@/types/import";

// Confirm rollback to a previous version. Restores it as a brand-new
// version (append-only) rather than reactivating the old row in place.
export function RollbackDialog({
  target,
  onOpenChange,
  onConfirm,
  rollingBack,
}: {
  target: PriceListVersion | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  rollingBack: boolean;
}) {
  // The parent clears `target` to null the instant the dialog should close,
  // but the dialog itself animates out over ~150ms — rendering off `target`
  // directly would flash "version ?" / "0 priced test(s)" during that
  // window. Keep showing the last real target while it closes.
  const [displayTarget, setDisplayTarget] = useState(target);
  if (target && target !== displayTarget) {
    setDisplayTarget(target);
  }

  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Roll back to version {displayTarget?.versionNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This restores version {displayTarget?.versionNumber}&apos;s {displayTarget?.recordCount ?? 0} priced
            test(s) as a new, active version. The currently active version will be marked rolled back — nothing is
            deleted, and this can be reversed the same way.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={rollingBack}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={rollingBack}>
            {rollingBack ? "Rolling back…" : "Roll back"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
