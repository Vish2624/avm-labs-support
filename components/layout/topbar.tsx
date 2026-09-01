import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { AuthUser } from "@/types/auth";

// TODO: location + service type context (via LocationSelector /
// ServiceTypeSelector) once workspace state is wired up (Phase 6).
export function Topbar({ user }: { user: AuthUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <span className="text-sm text-muted-foreground">AVM Labs Support Assistant</span>
      <div className="flex items-center gap-3">
        <span className="text-sm">{user.email}</span>
        <Badge variant="secondary" className="capitalize">
          {user.role}
        </Badge>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
