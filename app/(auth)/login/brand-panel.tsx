"use client";

import { useRef, useState } from "react";
import { CheckIcon } from "lucide-react";

const MARQUEE_TESTS = [
  "CBC", "TSH", "HbA1c", "Vitamin D", "Ferritin", "Lipid Profile", "CRP", "Vitamin B12", "AMH", "Creatinine", "Anti-TPO", "Albumin",
];

// Rising sparks: [left %, size px, duration s, delay s].
const SPARKS: [number, number, number, number][] = [
  [8, 4, 18, 0], [22, 3, 13, 2.5], [38, 4, 16, 5], [55, 3, 12, 1.2], [68, 3, 15, 3.8],
  [80, 3, 11, 6], [90, 4, 17, 2], [15, 3, 10, 4.4], [47, 3, 14, 7], [73, 4, 18, 0.6],
];

const ease = "cubic-bezier(0.2,0.8,0.2,1)";

/**
 * Sign-in page's brand side: gradient card with a panning grid, drifting
 * glows, a cursor spotlight and a small looping demo of the workflow
 * (search → add → reply) that tilts with the mouse. Purely decorative.
 */
export function BrandPanel({ locations }: { locations: { name: string; currencyCode: string }[] }) {
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const frame = useRef(0);

  function handleMove(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setPointer({ x, y });
    });
  }

  const tilt = `perspective(1000px) rotateX(${((0.5 - pointer.y) * 8).toFixed(2)}deg) rotateY(${((pointer.x - 0.5) * 10).toFixed(2)}deg) translate3d(${((pointer.x - 0.5) * 14).toFixed(1)}px, ${((pointer.y - 0.5) * 10).toFixed(1)}px, 0)`;

  return (
    <section
      onMouseMove={handleMove}
      onMouseLeave={() => setPointer({ x: 0.5, y: 0.5 })}
      className="relative m-3.5 flex min-h-[520px] flex-col justify-between overflow-hidden rounded-[26px] p-10 text-white avm-fade-up"
      style={{ background: "linear-gradient(160deg, oklch(0.5 0.16 258) 0%, oklch(0.36 0.13 262) 100%)" }}
    >
      {/* Panning grid, faded out towards the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 60% 40%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 60% 40%, #000 20%, transparent 75%)",
          animation: "avm-grid-pan 30s linear infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[120px] -right-20 size-[420px] rounded-full opacity-35 blur-[90px]"
        style={{ background: "oklch(0.7 0.14 220)", animation: "avm-drift 14s ease-in-out infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -left-[60px] size-[360px] rounded-full opacity-25 blur-[90px]"
        style={{ background: "oklch(0.66 0.14 150)", animation: "avm-drift 18s ease-in-out infinite reverse" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-150"
        style={{
          background: `radial-gradient(420px circle at ${(pointer.x * 100).toFixed(1)}% ${(pointer.y * 100).toFixed(1)}%, rgba(255,255,255,.16), transparent 60%)`,
        }}
      />
      {SPARKS.map(([left, size, duration, delay]) => (
        <span
          key={`${left}-${delay}`}
          aria-hidden
          className="pointer-events-none absolute -bottom-2.5 rounded-full bg-white opacity-0"
          style={{ left: `${left}%`, width: size, height: size, animation: `avm-rise ${duration}s ${delay}s linear infinite` }}
        />
      ))}

      <div className="relative flex items-center gap-3" style={{ animation: `avm-fade-up .6s .1s ${ease} both` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, no benefit from next/image */}
        <img src="/logo/avm-labs-logo-full.svg" alt="AVM Labs" className="h-[72px] w-auto rounded-2xl bg-white p-1.5 shadow-[0_8px_24px_-10px_rgb(0_0_0/0.35)]" />
        <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-sm font-medium whitespace-nowrap">
          AVM Support
        </span>
      </div>

      {/* Looping demo of the workflow: typed search → rows added → reply. */}
      <div className="relative grid flex-1 place-items-center py-9" aria-hidden>
        <div
          className="relative flex w-full max-w-[400px] flex-col gap-3 text-foreground transition-transform duration-500"
          style={{ transform: tilt, transformStyle: "preserve-3d", transitionTimingFunction: ease, animation: `avm-fade-up .8s .25s ${ease} both` }}
        >
          <div
            className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-elevated"
            style={{ animation: "avm-float 7s ease-in-out infinite" }}
          >
            <span className="size-3 shrink-0 rounded-full border-2 border-muted-foreground" />
            <span
              className="inline-block overflow-hidden border-r-2 border-primary font-mono text-[13.5px] whitespace-nowrap"
              style={{ animation: "avm-typing 8s steps(19) infinite, avm-caret .8s step-end infinite" }}
            >
              thyroid, vitamin D
            </span>
          </div>
          <div
            className="ml-7 flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-1.5 shadow-elevated"
            style={{ animation: "avm-float 8s 1s ease-in-out infinite" }}
          >
            {[
              { name: "THYROID (TSH)", tat: "Ready in 8 hours", delay: "0s" },
              { name: "VITAMIN D (25-OH)", tat: "Ready in 8 hours", delay: ".25s" },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-[9px]"
                style={{ animation: `avm-row-loop 8s ${row.delay} infinite both` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{row.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{row.tat}</div>
                </div>
                <span className="rounded-lg bg-success/15 px-[9px] py-[5px] text-xs font-medium text-success-foreground">
                  Added ✓
                </span>
              </div>
            ))}
          </div>
          <div
            className="max-w-[290px] self-start rounded-[4px_16px_16px_16px] bg-bubble px-3.5 py-3 text-[13px] leading-relaxed text-bubble-foreground shadow-elevated"
            style={{ animation: "avm-bubble-loop 8s infinite both" }}
          >
            Hi! Here are the details for your requested tests…
            <br />
            <strong className="font-semibold">Total and discount included</strong>
          </div>
          <div
            className="absolute -right-2 -bottom-3.5 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-elevated"
            style={{ animation: "avm-float 6s .5s ease-in-out infinite" }}
          >
            <span className="grid size-[26px] place-items-center rounded-full bg-success text-white">
              <CheckIcon className="size-3.5" />
            </span>
            <div className="flex flex-col leading-tight whitespace-nowrap">
              <span className="text-[13px] font-semibold">Reply ready</span>
              <span className="text-[11.5px] text-muted-foreground">in under a minute</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex max-w-[440px] flex-col gap-2.5">
        <h2 className="m-0 flex flex-wrap gap-2.5 text-[34px] leading-[1.1] font-semibold tracking-[-0.025em]">
          {["Search.", "Quote.", "Reply."].map((word, index) => (
            <span key={word} style={{ animation: `avm-word-cycle 6s ${index * 2}s infinite both` }}>
              {word}
            </span>
          ))}
        </h2>
        <p
          className="m-0 text-[14.5px] leading-relaxed text-pretty text-white/80"
          style={{ animation: `avm-fade-up .6s .4s ${ease} both` }}
        >
          Find the right test fast and send customers a clear, ready-to-paste quote on WhatsApp.
        </p>
        {locations.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5" style={{ animation: `avm-fade-up .6s .5s ${ease} both` }}>
            {locations.map((location) => (
              <span
                key={location.name}
                className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs whitespace-nowrap"
              >
                <span className="size-[5px] rounded-full" style={{ background: "oklch(0.8 0.14 150)" }} />
                {location.name} · {location.currencyCode}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div
        aria-hidden
        className="relative -mx-10 mt-6 overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        <div className="flex w-max gap-2" style={{ animation: "avm-marquee 32s linear infinite" }}>
          {[...MARQUEE_TESTS, ...MARQUEE_TESTS].map((test, index) => (
            <span
              key={`${test}-${index}`}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap"
            >
              {test}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
