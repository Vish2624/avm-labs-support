"use client";

import { SearchIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

// Search box driving alias/fuzzy test lookup (see lib/search/search-tests.ts
// via /api/search). Purely controlled — debouncing/fetching happens in the
// workspace client that owns the query state.
export function TestSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <SearchIcon className="size-4" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="Search by test name, code, or alias (e.g. “insulin resistance”)"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
      />
    </InputGroup>
  );
}
