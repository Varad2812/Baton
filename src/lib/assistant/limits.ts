// Per-IP limits for the assistant. Over the soft limit, answers come from the offline engine only
// (no model calls); over the hard limit the request is refused with 429.
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const SOFT_LIMIT = 20;
export const HARD_LIMIT = 60;
export const WINDOW_MS = 10 * 60_000;

export async function assistantBudget(bucket: "assistant-chat" | "assistant-draft" | "ask"): Promise<{ offlineOnly: boolean; retryAfter: number }> {
  const ip = await clientIp();
  const hard = rateLimit(`${bucket}-hard`, ip, HARD_LIMIT, WINDOW_MS);
  if (hard) return { offlineOnly: true, retryAfter: hard };
  const soft = rateLimit(bucket, ip, SOFT_LIMIT, WINDOW_MS);
  return { offlineOnly: soft > 0, retryAfter: 0 };
}
