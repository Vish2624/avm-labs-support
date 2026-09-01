"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Final confirm-and-activate step. Warnings require an explicit
// acknowledgement checkbox before the button unlocks (spec: "warnings
// require explicit admin review before confirming"); errors block entirely
// upstream (canActivate is false whenever a version failed validation).
export function ImportConfirmation({
  canActivate,
  hasWarnings,
  activating,
  onActivate,
}: {
  canActivate: boolean;
  hasWarnings: boolean;
  activating: boolean;
  onActivate: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!canActivate) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {hasWarnings ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={acknowledged} onCheckedChange={setAcknowledged} />
          I&apos;ve reviewed the warnings above and want to proceed.
        </label>
      ) : null}
      <Button type="button" onClick={onActivate} disabled={activating || (hasWarnings && !acknowledged)} className="w-fit">
        <CheckIcon /> {activating ? "Activating…" : "Confirm & activate"}
      </Button>
    </div>
  );
}
