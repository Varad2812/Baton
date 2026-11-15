// Tiny in-memory sliding-window rate limiter (per server instance; fine for one Render instance).
import { headers } from "next/headers";

const g = globalThis as unknown as { __batonRate?: Map<string, number[]> };
const hits = (g.__batonRate ??= new Map<string, number[]>());

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Returns seconds to wait, or 0 when the call is allowed (and counts it). */
export function rateLimit(bucket: string, key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const k = `${bucket}:${key}`;
  const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(k, recent);
    return Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
  }
  recent.push(now);
  hits.set(k, recent);
  if (hits.size > 5000) for (const [key2, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(key2);
  return 0;
}
