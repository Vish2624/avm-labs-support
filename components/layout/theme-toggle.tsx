"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

// Light/dark switch: a pill track with a sliding knob that carries the
// current mode's icon. Knob position and icons are driven purely by CSS off
// the `.dark` class (not by `resolvedTheme`), so there's no hydration
// mismatch and no flash on first paint.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={resolvedTheme === "dark"}
      aria-label="Dark mode"
      title="Switch light / dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative inline-flex h-8 w-[60px] shrink-0 items-center rounded-full border border-border bg-muted p-[3px] transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-primary/25"
    >
      {/* Faint track icons on either side of the knob. */}
      <Sun className="absolute left-[9px] size-3.5 text-muted-foreground/60" />
      <Moon className="absolute right-[9px] size-3.5 text-muted-foreground/60" />
      <span className="relative z-10 grid size-6 place-items-center rounded-full bg-card shadow-[0_1px_3px_oklch(0.2_0.02_258/0.25)] transition-transform duration-200 ease-out dark:translate-x-7">
        <Sun className="size-3.5 text-amber-500 dark:hidden" />
        <Moon className="hidden size-3.5 text-primary dark:block" />
      </span>
    </button>
  );
}
