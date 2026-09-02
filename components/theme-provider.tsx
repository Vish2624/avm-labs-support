"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Class-based theme switching (globals.css keys dark tokens off `.dark`).
// Defaults to the OS setting; the topbar toggle sets an explicit override.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
