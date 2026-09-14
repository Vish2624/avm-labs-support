"use client";

import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ResolvedTestQuery } from "@/lib/search/resolve-test-ids";

export type ProfileSearchMode = "name" | "tests";

const modeTriggerClassName = cn(
  "rounded-full border border-border/70 bg-card px-4.5 py-2.5 text-sm font-medium text-muted-foreground shadow-none transition-all",
  "hover:border-primary/50 hover:text-foreground",
  "data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
);

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
      <TabsList className="mb-1 h-auto gap-1.5 rounded-none bg-transparent p-0">
        <TabsTrigger value="name" className={modeTriggerClassName}>
          By name
        </TabsTrigger>
        <TabsTrigger value="tests" className={modeTriggerClassName}>
          By test names
        </TabsTrigger>
      </TabsList>

      <TabsContent value="name" className="mt-3">
        <InputGroup className="h-[60px] rounded-[18px] px-3.5">
          <InputGroupAddon>
            <SearchIcon className="size-5" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by package name"
            value={nameQuery}
            onChange={(event) => onNameQueryChange(event.target.value)}
            className="text-base"
            autoFocus
          />
        </InputGroup>
      </TabsContent>

      <TabsContent value="tests" className="mt-3">
        <div className="flex flex-col gap-2.5">
          <Input
            placeholder="Type the tests the customer asked for, press Enter after each"
            value={chipInput}
            onChange={(event) => setChipInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addChip();
              }
            }}
            className="h-[60px] rounded-[18px] px-5 text-base"
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
