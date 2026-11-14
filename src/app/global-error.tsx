"use client";

import Link from "next/link";

// Replaces the root layout, so it cannot use Tailwind tokens or next/font: styles are inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const btn = {
    height: 28,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as const;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0D15",
          color: "#E8EAF2",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 448, padding: 24 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7186", fontFamily: "ui-monospace, monospace" }}>
            Error{error.digest ? ` · ${error.digest}` : ""}
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 600, fontFamily: "'Source Serif 4', Georgia, serif" }}>
            Baton hit a snag
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.6, color: "#A9AEC2" }}>
            Nothing was lost. Try again, or open the demo from the start.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ ...btn, background: "#E8A33D", color: "#0B0D15", border: "1px solid transparent" }}
            >
              Try again
            </button>
            <Link href="/p/festflow" style={{ ...btn, background: "#11141F", color: "#E8EAF2", border: "1px solid #252A3A" }}>
              Open live demo
            </Link>
            <Link href="/" style={{ ...btn, color: "#A9AEC2", border: "1px solid transparent" }}>
              Back to home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
