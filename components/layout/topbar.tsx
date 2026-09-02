import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { AuthUser } from "@/types/auth";

export function Topbar({ user }: { user: AuthUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
      <span className="text-sm font-medium text-muted-foreground">AVM Labs Support Assistant</span>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
        <Badge variant="secondary" className="capitalize">
          {user.role}
        </Badge>
        <ThemeToggle />
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
