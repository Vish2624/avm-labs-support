"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Shared UI for every route error boundary (app/error.tsx and the
 * segment-scoped ones). Keeps each boundary file a two-line wrapper so the
 * look stays consistent. Logs the error to the console once on mount —
 * useful in dev and picked up by any browser-console log drain in prod.
 */
export function PageError({
  error,
  reset,
  title = "Something went wrong",
  description = "This section failed to load. Try again, and if it keeps happening let an admin know.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    console.error("[page-error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <Alert variant="destructive" className="max-w-xl">
        <AlertTriangle />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {description}
          {error.digest ? (
            <span className="mt-1 block font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
      <Button variant="outline" size="sm" onClick={reset}>
        <RotateCcw />
        Try again
      </Button>
    </div>
  );
}
