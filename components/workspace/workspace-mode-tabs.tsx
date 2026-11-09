"use client";

import { ReceiptTextIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "search" | "paste" | "ai";

const segmentClassName = (active: boolean) =>
  cn(
    // The white "card" behind the active tab is a separate sliding element.
    "relative h-[34px] rounded-[9px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-250",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  );

/**
 * Search / Paste switch, plus the Support Assistant button — kept apart from
 * the switch since it's a separate module, not another way of searching.
 */
export function WorkspaceModeTabs({ tab, onChange }: { tab: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-nowrap max-md:gap-2">
      {/* Two equal segments with a card that slides under the active one
          (hidden while the separate assistant is open). */}
      <div role="tablist" aria-label="Find tests by" className="relative grid grid-cols-2 rounded-xl bg-muted p-1 max-md:flex-1">
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)] transition-[transform,translate,scale,rotate,opacity] duration-400 ease-[cubic-bezier(.34,1.3,.64,1)]",
            tab === "paste" && "translate-x-full",
            tab === "ai" && "opacity-0"
          )}
        />
        <button
          type="button"
          role="tab"
          aria-selected={tab === "search"}
          onClick={() => onChange("search")}
          className={segmentClassName(tab === "search")}
        >
          Search<span className="max-md:hidden"> tests</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "paste"}
          onClick={() => onChange("paste")}
          className={segmentClassName(tab === "paste")}
        >
          Paste<span className="max-md:hidden"> text or image</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange("ai")}
        aria-pressed={tab === "ai"}
        className={cn(
          "flex h-[42px] shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium whitespace-nowrap md:px-4 transition-[transform,translate,scale,rotate,box-shadow,background] duration-250 hover:-translate-y-px",
          tab === "ai"
            ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)]"
            : "border-border bg-card text-primary hover:shadow-[0_8px_20px_-10px_var(--primary)]"
        )}
      >
        <span
          aria-hidden
          className={cn("size-2.5 rotate-45 rounded-[2px]", tab === "ai" ? "bg-primary-foreground" : "bg-primary")}
        />
        <span className="md:hidden">Assistant</span>
        <span className="max-md:hidden">Support Assistant</span>
      </button>
    </div>
  );
}

/** The search column's own "Clear all": search box, pasted text and image — never the quote. */
export function ClearSearchButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Clear the search, pasted text and image (the quote stays)"
      className="flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] border border-destructive/30 bg-destructive/[0.06] px-3.5 text-sm font-medium whitespace-nowrap text-destructive transition-colors hover:border-destructive/50 hover:bg-destructive/15 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 avm-check"
    >
      <Trash2Icon className="size-4" />
      Clear all
    </button>
  );
}

/** Phones show one column at a time; this bottom bar switches between them. */
export function MobileViewSwitch({
  view,
  onChange,
  quoteCount,
}: {
  view: "search" | "quote";
  onChange: (view: "search" | "quote") => void;
  quoteCount: number;
}) {
  const buttonClassName = (active: boolean) =>
    cn(
      "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
      active ? "bg-primary/10 text-primary" : "text-muted-foreground"
    );
  return (
    <nav
      aria-label="Switch view"
      className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-border bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <button
        type="button"
        onClick={() => onChange("search")}
        aria-pressed={view === "search"}
        className={buttonClassName(view === "search")}
      >
        <SearchIcon className="size-4" />
        Search
      </button>
      <button
        type="button"
        onClick={() => onChange("quote")}
        aria-pressed={view === "quote"}
        className={buttonClassName(view === "quote")}
      >
        <ReceiptTextIcon className="size-4" />
        Quote
        {quoteCount > 0 ? (
          <span
            key={quoteCount}
            className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground avm-check"
          >
            {quoteCount}
          </span>
        ) : null}
      </button>
    </nav>
  );
}
