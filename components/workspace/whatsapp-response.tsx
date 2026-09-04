"use client";

import { CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Generated, copy-ready reply text built only from verified DB fields
// (see lib/whatsapp/generate-response.ts). Copy is the panel's primary
// action, so it's a full-width button under the preview.
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
    <div className="flex flex-col gap-2">
      <Label htmlFor="whatsapp-response">WhatsApp reply</Label>
      <Textarea
        id="whatsapp-response"
        readOnly
        value={message}
        className="min-h-40 font-mono text-xs"
      />
      <Button
        type="button"
        className="w-full"
        disabled={disabled}
        onClick={handleCopy}
      >
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
