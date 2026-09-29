"use client";

import { useRef, useState } from "react";

/** The sign-in form's side of the page, with a soft glow that follows the mouse. */
export function FormSide({ children }: { children: React.ReactNode }) {
  const [glow, setGlow] = useState({ x: 50, y: 45 });
  const frame = useRef(0);

  function handleMove(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setGlow({ x, y });
    });
  }

  return (
    <section onMouseMove={handleMove} className="relative grid place-items-center overflow-hidden px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-200"
        style={{
          background: `radial-gradient(360px circle at ${glow.x.toFixed(1)}% ${glow.y.toFixed(1)}%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 65%)`,
        }}
      />
      {children}
    </section>
  );
}
