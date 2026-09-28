"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { imageFromDataTransfer } from "./image-reader";

/** Pasted text longer than this is a message, not a test name. */
const MESSAGE_MIN_LENGTH = 40;

/**
 * A customer message or a list of tests rather than one search: several
 * lines, several comma/semicolon-separated items, or a long sentence.
 * "TSH" or "vitamin D" is a search; "TSH, T3, T4" or "Hi, how much is…" is not.
 */
export function looksLikeMessage(text: string): boolean {
  const trimmed = text.trim();
  return /[\r\n]/.test(trimmed) || /[,;|]/.test(trimmed) || trimmed.length > MESSAGE_MIN_LENGTH;
}

// Search box driving alias/fuzzy test lookup (see lib/search/search-tests.ts
// via /api/search). Typed searches only: a pasted image, customer message
// or list of tests is handed to the "Paste text or image" tab instead
// (onPasteMessage / onPasteImage). Purely controlled — debouncing/fetching
// happens in the workspace client that owns the query state. Enter fires
// onSubmit (the client adds the top result); the × clears the box.
export function TestSearch({
  value,
  onChange,
  onSubmit,
  inputRef,
  onPasteMessage,
  onPasteImage,
}: {
  value: string;
  onChange: (query: string) => void;
  onSubmit?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  onPasteMessage?: (text: string) => void;
  onPasteImage?: (image: File) => void;
}) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-[17px] -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={(event) => {
          const image = imageFromDataTransfer(event.clipboardData);
          if (image && onPasteImage) {
            event.preventDefault();
            onPasteImage(image);
            return;
          }
          const pasted = event.clipboardData.getData("text");
          if (onPasteMessage && looksLikeMessage(pasted)) {
            event.preventDefault();
            onPasteMessage(pasted.trim());
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder="Search a test or package, e.g. TSH, vitamin D, lipid profile"
        aria-label="Search tests"
        autoFocus
        className="h-[52px] w-full rounded-[14px] border border-input bg-card pr-12 pl-[46px] text-[15px] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2.5 grid size-[30px] -translate-y-1/2 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted avm-check"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
