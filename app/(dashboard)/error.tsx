"use client";

import { PageError } from "@/components/layout/page-error";

// Dashboard-scoped error boundary: the sidebar/topbar chrome from
// (dashboard)/layout.tsx stays put, only the page area shows the error.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError error={error} reset={reset} />;
}
