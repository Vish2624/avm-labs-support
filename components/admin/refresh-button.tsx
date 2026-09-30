"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Re-reads the current server page's data in place. A <Link> to the page
// you're already on does nothing (Next keeps the page as is), so this asks
// the router to fetch it again — spinning while it does, then showing when.
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  return (
    <div className="flex items-center gap-2.5">
      {updatedAt && !pending ? (
        <span className="text-xs text-muted-foreground">
          Updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            setUpdatedAt(new Date());
          })
        }
        className="flex h-9 items-center gap-2 rounded-[10px] border border-border px-3.5 text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-70"
      >
        <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
