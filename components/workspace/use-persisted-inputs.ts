"use client";

import { useEffect, useRef, type RefObject } from "react";

// The search box and pasted text, kept for this browser tab only
// (sessionStorage), so a refresh brings them — and their results — back.
const INPUTS_STORAGE_KEY = "avm-workspace-inputs-v1";

export interface PersistedInputs {
  query: string;
  pasteText: string;
  submittedPasteText: string;
}

/**
 * Restores the search box / pasted text after a refresh, then keeps saving
 * them. The restore runs before the saver, so nothing empty overwrites the
 * saved copy.
 */
export function usePersistedInputs(
  values: PersistedInputs,
  restore: (saved: Partial<PersistedInputs>) => void,
  searchInputRef: RefObject<HTMLInputElement | null>
) {
  const restoredRef = useRef(false);
  const restoreRef = useRef(restore);

  useEffect(() => {
    // Typed into the search box while the page was still loading: that
    // wins over the saved copy, so the agent's first keystrokes aren't lost.
    const typedEarly = searchInputRef.current?.value ?? "";
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(INPUTS_STORAGE_KEY) ?? "null") as Record<
        string,
        unknown
      > | null;
      const pick = (key: keyof PersistedInputs) => (typeof saved?.[key] === "string" ? (saved[key] as string) : undefined);
      const restoredQuery = typedEarly || pick("query") || "";
      restoreRef.current({
        query: restoredQuery,
        pasteText: pick("pasteText"),
        submittedPasteText: pick("submittedPasteText"),
      });
      // A search brought back from before the reload is shown selected, so
      // the next thing typed replaces it instead of being appended to it
      // ("egfr" + "anemia" must not become "egfranemia").
      const input = searchInputRef.current;
      if (!typedEarly && restoredQuery && input) {
        const selectRestored = () => {
          if (input.value === restoredQuery) input.select();
        };
        requestAnimationFrame(() => {
          if (document.activeElement === input) selectRestored();
          else input.addEventListener("focus", () => requestAnimationFrame(selectRestored), { once: true });
        });
      }
    } catch {
      // Storage blocked or unreadable — start empty.
    }
    restoredRef.current = true;
  }, [searchInputRef]);

  const { query, pasteText, submittedPasteText } = values;
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      window.sessionStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify({ query, pasteText, submittedPasteText }));
    } catch {
      // Storage blocked — nothing is kept across a refresh.
    }
  }, [query, pasteText, submittedPasteText]);
}
