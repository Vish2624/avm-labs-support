"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown by the root layout itself, where
// no app chrome (or the normal <html>/<body>) is available — so this file
// must render them. Everything else is handled by app/error.tsx and the
// segment-scoped boundaries.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafafa",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            The app failed to load
          </h1>
          <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px" }}>
            An unexpected error occurred before the page could render. Reload to
            try again.
            {error.digest ? (
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                }}
              >
                Reference: {error.digest}
              </span>
            ) : null}
          </p>
          <button
            onClick={reset}
            style={{
              fontSize: 14,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #d4d4d4",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
