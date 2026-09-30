"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DetailsUpload } from "./details-upload";
import { writeTabToUrl } from "@/lib/utils/url-tab";

const TABS = [
  { id: "prices", label: "Master price list" },
  { id: "profiles", label: "Profiles & packages" },
] as const;

export type UploadTab = (typeof TABS)[number]["id"];

// The two Admin uploads, both laid out like the master file (one row per
// item, a TAT + price column pair per location): the master price list
// (tests, aliases and prices at every location) and profiles/packages
// (test lists + bundle prices).
export function UploadTabs({ initialTab = "prices" }: { initialTab?: UploadTab }) {
  const [tab, setTab] = useState<UploadTab>(initialTab);
  // In the URL, so a refresh stays on this tab.
  useEffect(() => writeTabToUrl(tab, "prices"), [tab]);

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

      {tab === "prices" ? (
        <DetailsUpload
          key="tests"
          kind="tests"
          description="Same layout as the master Excel's Tests sheet: Test Code, Test Name, Alias Names, then a TAT and a price column for each location. One file updates every location. Blank cells keep the current value; aliases are only added."
        />
      ) : null}
      {tab === "profiles" ? (
        <DetailsUpload
          key="profiles"
          kind="profiles"
          description="Same layout as the Profile Prices file: Profile Code, Profile Name, Test Codes, then a price and a TAT column for each location. Blank cells keep the current value."
        />
      ) : null}
    </div>
  );
}
