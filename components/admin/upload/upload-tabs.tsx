"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { UploadClient } from "./upload-client";
import { DetailsUpload } from "./details-upload";
import type { Location } from "@/types/location";

const TABS = [
  { id: "prices", label: "Price list" },
  { id: "tests", label: "Test details" },
  { id: "profiles", label: "Profiles & packages" },
] as const;

// The three Admin uploads: a location's price list (versioned import),
// test details (catalog + aliases + prices), and profiles/packages
// (test lists + bundle prices).
export function UploadTabs({ locations }: { locations: Location[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("prices");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-[30px] rounded-lg px-3.5 text-[13px] font-medium transition-colors",
              tab === id ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.02_258/0.12)]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "prices" ? <UploadClient locations={locations} /> : null}
      {tab === "tests" ? (
        <DetailsUpload
          kind="tests"
          description="Create or update tests (name, short name, category, aliases, active) and set their prices at any location in one file. Blank cells keep the current value; aliases are only added."
        />
      ) : null}
      {tab === "profiles" ? (
        <DetailsUpload
          kind="profiles"
          description="Create or update profiles/packages, set the tests inside each one (by test code), and set their bundle price at each location. Blank cells keep the current value."
        />
      ) : null}
    </div>
  );
}
