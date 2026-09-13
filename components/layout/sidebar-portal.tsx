"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// The dashboard layout mounts <Sidebar> once and keeps it alive across
// client-side navigation (it lives above the page outlet), so this id is a
// stable target a page can portal page-specific content into — currently
// just the Support Workspace's profile-match suggestions, in the empty rail
// space below the nav links. Content mounts/unmounts with the page itself.
export const SIDEBAR_PANEL_ID = "sidebar-page-panel";

export function SidebarPortal({ children }: { children: React.ReactNode }) {
  // Lazy initializer, not an effect: the target div is always present in
  // Sidebar's markup, so it can be looked up on first client render — no
  // need for a second render pass just to find it. Stays null on the server
  // (no `document`) and on every server-rendered pass.
  const [target] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(SIDEBAR_PANEL_ID)
  );

  if (!target) return null;
  return createPortal(children, target);
}
