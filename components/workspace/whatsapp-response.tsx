"use client";

import { CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Generated, copy-ready reply text built only from verified DB fields
// (see lib/whatsapp/generate-response.ts). Shown as a read-only preview —
// copy is the panel's primary action, so it's a full-width button below it.
export function WhatsappResponse({ message, disabled }: { message: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Reply to send</h2>
      <div className="max-h-64 overflow-auto rounded-2xl rounded-bl-[5px] bg-success/10 px-4 py-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-success-foreground">
        {message}
      </div>
      <Button type="button" className="w-full" size="lg" disabled={disabled} onClick={handleCopy}>
        {copied ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          <>
            <CopyIcon /> Copy reply
          </>
        )}
      </Button>
    </div>
  );
}
