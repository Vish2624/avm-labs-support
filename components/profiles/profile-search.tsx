"use client";

import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ResolvedTestQuery } from "@/lib/search/resolve-test-ids";

export type ProfileSearchMode = "name" | "tests";

// Search by profile name/code, or by one-or-more test-name chips (each chip
// gets resolved to a catalog test id server-side — see resolvedByQuery).
export function ProfileSearch({
  mode,
  onModeChange,
  nameQuery,
  onNameQueryChange,
  testQueries,
  onTestQueriesChange,
  resolvedByQuery,
}: {
  mode: ProfileSearchMode;
  onModeChange: (mode: ProfileSearchMode) => void;
  nameQuery: string;
  onNameQueryChange: (value: string) => void;
  testQueries: string[];
  onTestQueriesChange: (queries: string[]) => void;
  resolvedByQuery: Map<string, ResolvedTestQuery>;
}) {
  const [chipInput, setChipInput] = useState("");

  function addChip() {
    const trimmed = chipInput.trim();
    setChipInput("");
    if (!trimmed || testQueries.includes(trimmed)) return;
    onTestQueriesChange([...testQueries, trimmed]);
  }

  function removeChip(query: string) {
    onTestQueriesChange(testQueries.filter((existing) => existing !== query));
  }

  return (
    <Tabs value={mode} onValueChange={(value) => onModeChange(value as ProfileSearchMode)}>
      <TabsList>
        <TabsTrigger value="name">By name</TabsTrigger>
        <TabsTrigger value="tests">By test names</TabsTrigger>
      </TabsList>

      <TabsContent value="name" className="mt-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by profile name or code"
            value={nameQuery}
            onChange={(event) => onNameQueryChange(event.target.value)}
            autoFocus
          />
        </InputGroup>
      </TabsContent>

      <TabsContent value="tests" className="mt-3">
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Type a test name, code, or alias and press Enter"
            value={chipInput}
            onChange={(event) => setChipInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addChip();
              }
            }}
          />
          {testQueries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {testQueries.map((query) => {
                const resolved = resolvedByQuery.get(query);
                const label = resolved?.test?.officialName ?? query;
                const unresolved = resolved !== undefined && resolved.test === null;
                return (
                  <Badge key={query} variant={unresolved ? "destructive" : "secondary"} className="gap-1">
                    {label}
                    <button
                      type="button"
                      onClick={() => removeChip(query)}
                      aria-label={`Remove ${label}`}
                      className="ml-0.5"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
      </TabsContent>
    </Tabs>
  );
}
