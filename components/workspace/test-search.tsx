"use client";

import { SearchIcon, XIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";

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
    <InputGroup className="h-[52px] rounded-2xl px-3">
      <InputGroupAddon>
        <SearchIcon className="size-[22px]" />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder="Type a test name, code, or the customer's words"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        className="text-[15.5px]"
        autoFocus
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Clear search"
            onClick={() => onChange("")}
          >
            <XIcon />
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
