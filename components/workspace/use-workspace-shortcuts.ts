"use client";

import { useEffect, useRef, type RefObject } from "react";
import { looksLikeMessage } from "./search/test-search";
import { imageFromDataTransfer } from "./paste/image-reader";

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (/INPUT|TEXTAREA|SELECT/.test(element.tagName) || element.isContentEditable));
};

/**
 * Page-wide keyboard and clipboard shortcuts for the Quote Builder:
 * - "/" or Cmd/Ctrl+K focuses the search box (unless already typing).
 * - On the search tab, typing anywhere else (after clicking a result, say)
 *   lands in the search box too.
 * - Pasting while not in a box: an image or a message goes to the paste
 *   reader; a short name is searched.
 */
export function useWorkspaceShortcuts(
  searchInputRef: RefObject<HTMLInputElement | null>,
  handlers: {
    /** The search tab is open. */
    onSearchTab: boolean;
    focusSearch: () => void;
    editQuery: (update: (current: string) => string) => void;
    searchFor: (text: string) => void;
    readMessage: (text: string) => void;
    readImage: (image: File) => void;
  }
) {
  // Latest handlers, so the listeners are attached once.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const current = handlersRef.current;
      const typing = isTypingTarget(event.target);
      const isSlash = event.key === "/" && !typing;
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isSlash || isCmdK) {
        event.preventDefault();
        current.focusSearch();
        return;
      }

      const input = searchInputRef.current;
      if (typing || !input || !current.onSearchTab) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const isChar = event.key.length === 1;
      // Space still presses a focused button/link rather than typing.
      const onControl = Boolean((event.target as HTMLElement | null)?.closest("button, a, [role='button']"));
      if (isChar && !(event.key === " " && onControl)) {
        event.preventDefault();
        current.editQuery((query) => query + event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        current.editQuery((query) => query.slice(0, -1));
      } else {
        return;
      }
      input.focus();
      // Caret after the text React is about to write in.
      requestAnimationFrame(() => {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      });
    }

    function handlePaste(event: ClipboardEvent) {
      if (isTypingTarget(event.target)) return;
      const image = imageFromDataTransfer(event.clipboardData);
      const text = event.clipboardData?.getData("text").trim() ?? "";
      if (!image && !text) return;
      event.preventDefault();
      if (image) handlersRef.current.readImage(image);
      else if (looksLikeMessage(text)) handlersRef.current.readMessage(text);
      else handlersRef.current.searchFor(text);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, [searchInputRef]);
}
