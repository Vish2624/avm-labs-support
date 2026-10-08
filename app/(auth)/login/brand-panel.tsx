"use client";

import { CheckIcon, MapPinIcon, SearchIcon } from "lucide-react";

const ease = "cubic-bezier(0.2,0.8,0.2,1)";

// The workflow preview's 9s loop: step n uses the `avm-demo-n` keyframes in globals.css.
const demoStep = (n: number) => `avm-demo-${n} 9s ${ease} infinite both`;

/**
 * Sign-in page's brand side: gradient card with two soft glows, a small
 * looping preview of the workflow (search → add → reply) and the locations.
 * Only the preview moves; everything else is static. Purely decorative.
 */
export function BrandPanel({ locations }: { locations: { name: string; currencyCode: string }[] }) {
  return (
    <section
      className="relative m-3.5 hidden flex-col justify-between gap-6 overflow-hidden rounded-[26px] p-10 text-white lg:sticky lg:top-3.5 lg:flex lg:h-[calc(100svh-28px)] [@media(max-height:800px)]:p-8"
      style={{ background: "linear-gradient(160deg, oklch(0.5 0.16 258) 0%, oklch(0.36 0.13 262) 100%)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[120px] -right-20 size-[420px] rounded-full opacity-35 blur-[90px]"
        style={{ background: "oklch(0.7 0.14 220)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -left-[60px] size-[360px] rounded-full opacity-25 blur-[90px]"
        style={{ background: "oklch(0.66 0.14 150)" }}
      />

      <div className="relative flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img
          src="/logo/avm-labs-logo-full.svg"
          alt="AVM Labs"
          className="h-16 w-auto rounded-xl bg-white px-3 py-1.5 shadow-[0_8px_24px_-10px_rgb(0_0_0/0.35)]"
        />
        <span className="h-10 w-px bg-white/25" aria-hidden />
        <div className="flex flex-col leading-tight">
          <span className="text-[22px] font-semibold tracking-[-0.02em]">AVM Support</span>
          <span className="text-[13px] text-white/70">Support team workspace</span>
        </div>
      </div>

      {/* Looping preview: the search types out, the rows are added, then the reply is ready. */}
      <div className="relative grid min-h-0 flex-1 place-items-center" aria-hidden>
        <div className="relative flex w-full max-w-[500px] flex-col gap-4 pb-7 text-foreground">
          <div className="flex items-center gap-3 rounded-2xl bg-card px-5 py-4 shadow-elevated">
            <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" />
            <span
              className="inline-block overflow-hidden border-r-2 border-primary pr-0.5 text-[15px] whitespace-nowrap"
              style={{ animation: "avm-demo-type 9s steps(26) infinite, avm-caret 1s step-end infinite" }}
            >
              thyroid, vitamin D, HbA1c
            </span>
          </div>

          {/* The card arrives with its first row; the others follow a beat apart. */}
          <div
            className="flex flex-col divide-y divide-border rounded-2xl bg-card px-5 py-1 shadow-elevated"
            style={{ animation: demoStep(1) }}
          >
            {[
              { name: "Thyroid (TSH)", tat: "Ready in 8 hours", step: null },
              { name: "Vitamin D (25-OH)", tat: "Ready in 8 hours", step: 2 },
              { name: "HbA1c", tat: "Ready in 6 hours", step: 3 },
            ].map((row, index) => (
              <div
                key={row.name}
                className={`flex items-center gap-3 py-3.5 ${index === 2 ? "[@media(max-height:800px)]:hidden" : ""}`}
                style={row.step ? { animation: demoStep(row.step) } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold">{row.name}</div>
                  <div className="text-[12.5px] text-muted-foreground">{row.tat}</div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[12px] font-medium text-success-foreground">
                  <CheckIcon className="size-3" />
                  Added
                </span>
              </div>
            ))}
          </div>

          <div
            className="max-w-[330px] self-start rounded-[4px_16px_16px_16px] bg-bubble px-4 py-3.5 text-[14px] leading-relaxed text-bubble-foreground shadow-elevated [@media(max-height:720px)]:hidden"
            style={{ animation: demoStep(4) }}
          >
            Thank you for waiting, Sir/Ma’am. Here are the details you asked for…
            <br />
            <strong className="font-semibold">Total and discount included</strong>
          </div>

          <div
            className="absolute right-0 bottom-0 flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 shadow-elevated"
            style={{ animation: demoStep(5) }}
          >
            <span className="grid size-7 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="size-3.5" />
            </span>
            <div className="flex flex-col leading-tight whitespace-nowrap">
              <span className="text-[13px] font-semibold">Reply ready</span>
              <span className="text-[11.5px] text-muted-foreground">in under a minute</span>
            </div>
          </div>
        </div>
      </div>

      {locations.length > 0 ? (
        <div className="relative flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">
            Serving {locations.length} locations
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
            {locations.map((location) => (
              <div
                key={location.name}
                className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
                  <MapPinIcon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13.5px] font-semibold">{location.name}</span>
                  <span className="text-[11.5px] text-white/65">{location.currencyCode}</span>
                </div>
                <span className="ml-auto size-1.5 shrink-0 rounded-full" style={{ background: "oklch(0.8 0.14 150)" }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
