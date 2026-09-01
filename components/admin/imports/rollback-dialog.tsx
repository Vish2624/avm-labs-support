"use client";

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
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Roll back to version {target?.versionNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This restores version {target?.versionNumber}&apos;s {target?.recordCount ?? 0} priced test(s) as a new,
            active version. The currently active version will be marked rolled back — nothing is deleted, and this
            can be reversed the same way.
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
