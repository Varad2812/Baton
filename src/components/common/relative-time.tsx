"use client";

import { useSyncExternalStore } from "react";

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

// A shared 30 s clock: the server renders the absolute label, the client the relative one.
let tick = Math.floor(Date.now() / 30_000) * 30_000;
function subscribeClock(cb: () => void) {
  const t = setInterval(() => {
    tick = Date.now();
    cb();
  }, 30_000);
  return () => clearInterval(t);
}
const clockNow = () => (Date.now() - tick > 30_000 ? (tick = Date.now()) : tick);

/** "just now" / "3 min ago" for recent events (ticks every 30 s); falls back to the absolute label. */
export function RelativeTime({ at, fallback, className }: { at: Date | string; fallback: string; className?: string }) {
  const d = typeof at === "string" ? new Date(at) : at;
  const now = useSyncExternalStore(subscribeClock, clockNow, () => null);
  const r = now == null ? null : rel(d, now);
  return (
    <time dateTime={d.toISOString()} title={fallback} className={className}>
      {r ?? fallback}
    </time>
  );
}
