"use client";

import { SearchIcon, XIcon } from "lucide-react";

// Search box driving alias/fuzzy test lookup (see lib/search/search-tests.ts
// via /api/search). Purely controlled — debouncing/fetching happens in the
// workspace client that owns the query state. Enter fires onSubmit (the
// client adds the top result); the × clears the box.
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
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder="Search test name, code or nickname"
        aria-label="Search tests"
        autoFocus
        className="h-[50px] w-full rounded-xl border border-input bg-card px-11 text-[15px] outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-primary focus:ring-4 focus:ring-primary/12"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2.5 grid size-[30px] -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
