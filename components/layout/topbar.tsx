import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { AuthUser } from "@/types/auth";

export function Topbar({ user }: { user: AuthUser }) {
  const initial = user.email.charAt(0).toUpperCase();
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border/40 bg-background/70 px-5 py-2.5 backdrop-blur-xl">
      <span className="text-sm font-medium text-muted-foreground">AVM Labs Support Assistant</span>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card py-1 pr-3 pl-1 shadow-sm">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initial}
          </span>
          <div className="hidden items-center gap-1.5 sm:flex">
            <p className="text-xs leading-none font-medium">{user.email}</p>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] leading-none capitalize">
              {user.role}
            </Badge>
          </div>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
