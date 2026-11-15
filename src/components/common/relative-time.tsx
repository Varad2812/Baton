"use client";

import { useEffect, useState } from "react";

function rel(d: Date, now: number): string | null {
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 0) return null;
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return null;
}

/** "just now" / "3 min ago" for recent events (ticks every 30 s); falls back to the absolute label. */
export function RelativeTime({ at, fallback, className }: { at: Date | string; fallback: string; className?: string }) {
  const d = typeof at === "string" ? new Date(at) : at;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const r = now == null ? null : rel(d, now);
  return (
    <time dateTime={d.toISOString()} title={fallback} className={className}>
      {r ?? fallback}
    </time>
  );
}
