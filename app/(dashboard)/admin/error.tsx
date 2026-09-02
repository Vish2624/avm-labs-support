"use client";

import { PageError } from "@/components/layout/page-error";

// Admin-scoped error boundary: keeps the dashboard chrome and the admin
// sub-nav (AdminSidebar) mounted, replacing only the admin page subtree.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      error={error}
      reset={reset}
      description="This admin section failed to load. Try again — no changes were saved."
    />
  );
}
