// In-flight guard: the same mutation (same key) cannot run twice at once on this server. A double
// click or a retried request while the first is still running gets a 409 instead of a duplicate row.
import { ConflictError } from "@/lib/http";

const g = globalThis as unknown as { __batonInflight?: Set<string> };
const inflight = (g.__batonInflight ??= new Set());

export async function once<T>(key: string, fn: () => Promise<T>, message = "This is already being saved. Wait a moment."): Promise<T> {
  if (inflight.has(key)) throw new ConflictError(message);
  inflight.add(key);
  try {
    return await fn();
  } finally {
    inflight.delete(key);
  }
}
