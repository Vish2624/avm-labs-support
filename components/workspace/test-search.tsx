"use client";

import { SearchIcon, XIcon } from "lucide-react";

// Search box driving alias/fuzzy test lookup (see lib/search/search-tests.ts
// via /api/search). Purely controlled — debouncing/fetching happens in the
// workspace client that owns the query state. Enter fires onSubmit (the
// client adds the top result, or every result for a list of tests); the ×
// clears the box.
export function TestSearch({
  value,
  onChange,
  onSubmit,
  inputRef,
}: {
  value: string;
  onChange: (query: string) => void;
  onSubmit?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
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
          // A single-line input silently drops newlines, gluing a pasted
          // one-test-per-line list into one word ("TSH⏎T3" -> "TSHT3").
          // Keep each line as its own list item instead.
          const pasted = event.clipboardData.getData("text");
          if (!/[\r\n]/.test(pasted)) return;
          event.preventDefault();
          const input = event.currentTarget;
          const start = input.selectionStart ?? value.length;
          const end = input.selectionEnd ?? value.length;
          const flattened = pasted.trim().split(/\s*[\r\n]+\s*/).join(", ");
          onChange(value.slice(0, start) + flattened + value.slice(end));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder="Search a test, or paste a list of codes (TSH, T3, T4…)"
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
