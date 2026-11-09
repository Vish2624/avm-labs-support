"use client";

import { useEffect, useRef, useState } from "react";

// Floors for the draggable column split — matches the columns' own min-w
// classes so the divider never drags a column below where its content
// (buttons, filters) would start wrapping badly.
const LEFT_COLUMN_MIN_PX = 380;
const RIGHT_COLUMN_MIN_PX = 340;
const SPLIT_STORAGE_KEY = "avm-workspace-split-v2";
// The redesign's 1.25 : 1 split between "Find tests" and "Quotation".
const DEFAULT_LEFT_PERCENT = 55.5;

/**
 * Draggable split between "Find tests" and "Quotation" — remembered per
 * browser so an agent who prefers a wider search column doesn't have to
 * redrag it every session.
 */
export function useResizableSplit() {
  const columnsRef = useRef<HTMLDivElement>(null);
  // Starts at the SSR-safe default; hydrated from localStorage in an effect
  // below (reading it during the initial render would mismatch the
  // server-rendered HTML, which has no access to it).
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= 20 && saved <= 80) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a persisted preference
        setLeftPercent(saved);
      }
    } catch {
      // Storage blocked — keep the default split.
    }
  }, []);

  useEffect(() => {
    if (!resizing) return;

    function handlePointerMove(event: PointerEvent) {
      const container = columnsRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const minPercent = (LEFT_COLUMN_MIN_PX / rect.width) * 100;
      const maxPercent = 100 - (RIGHT_COLUMN_MIN_PX / rect.width) * 100;
      const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
      setLeftPercent(Math.min(Math.max(rawPercent, minPercent), maxPercent));
    }
    function handlePointerUp() {
      setResizing(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(leftPercent));
    } catch {
      // Storage blocked — the split just won't be remembered.
    }
  }, [leftPercent]);

  return {
    columnsRef,
    leftPercent,
    resizing,
    startResize: () => setResizing(true),
    resetSplit: () => setLeftPercent(DEFAULT_LEFT_PERCENT),
  };
}
