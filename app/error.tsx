"use client";

import { PageError } from "@/components/layout/page-error";

// Catch-all client error boundary for any route not covered by a more
// specific segment boundary (e.g. the (auth) group). Segment layouts stay
// mounted; only the errored page subtree is replaced.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError error={error} reset={reset} />;
}
