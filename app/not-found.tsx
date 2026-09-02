import Link from "next/link";
import { Button } from "@/components/ui/button";

// Custom 404. Rendered inside the root layout, so it has no sidebar — a
// plain centered card with a way back to the app.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Button variant="outline" size="sm" className="mt-1" render={<Link href="/workspace" />}>
        Back to workspace
      </Button>
    </main>
  );
}
