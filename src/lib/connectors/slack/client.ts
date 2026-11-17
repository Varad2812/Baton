// Minimal Slack Web API client (server only): bearer token, cursor pagination, 429 Retry-After,
// per-call timeout, and user-facing errors. Tokens never leave the server.
import { HttpError } from "@/lib/http";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SlackClientOpts = { token: string; fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; maxRetries?: number };

export class SlackApiError extends HttpError {
  constructor(
    readonly code: string,
    message: string,
    status = 502,
  ) {
    super(status, message);
    this.name = "SlackApiError";
  }
}

const MESSAGES: Record<string, string> = {
  not_in_channel: "Baton is not in this channel. In Slack, open the channel and type /invite @Baton, then retry.",
  channel_not_found: "Channel not found, or it is private and Baton was not invited. Type /invite @Baton in the channel.",
  missing_scope: "The Slack app is missing a permission (scope) for this. Reinstall it with the scopes in docs/SLACK.md.",
  invalid_auth: "The Slack token is invalid. Connect Slack again.",
  not_authed: "No Slack token was sent. Connect Slack again.",
  token_revoked: "The Slack app was removed from this workspace. Connect Slack again.",
  account_inactive: "The Slack app was removed from this workspace. Connect Slack again.",
  ratelimited: "Slack is rate limiting Baton. Try again in a minute.",
};

export function slackMessage(code: string): string {
  return MESSAGES[code] ?? `Slack returned "${code}".`;
}

export function slackClient(o: SlackClientOpts) {
  const f = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  async function call<T extends { ok: boolean; error?: string }>(method: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), o.timeoutMs ?? 15_000);
      let res: Response;
      try {
        res = await f(`https://slack.com/api/${method}?${qs}`, { headers: { Authorization: `Bearer ${o.token}` }, signal: ac.signal, cache: "no-store" });
      } catch (e) {
        throw new SlackApiError("network", (e as Error).name === "AbortError" ? "Slack did not answer within 15 seconds. Try again." : "Could not reach Slack. Try again.");
      } finally {
        clearTimeout(t);
      }
      if (res.status === 429) {
        const wait = Math.min(30, Number(res.headers.get("retry-after") ?? "1") || 1);
        if (attempt >= (o.maxRetries ?? 3)) throw new SlackApiError("ratelimited", slackMessage("ratelimited"), 429);
        await sleep(wait * 1000);
        continue;
      }
      if (!res.ok) throw new SlackApiError(`http_${res.status}`, `Slack returned HTTP ${res.status}. Try again.`);
      const j = (await res.json()) as T;
      if (!j.ok) throw new SlackApiError(j.error ?? "unknown_error", slackMessage(j.error ?? "unknown_error"), j.error === "invalid_auth" || j.error === "token_revoked" ? 401 : 400);
      return j;
    }
  }

  /** Follow response_metadata.next_cursor until done or `cap` items collected. */
  async function paginate<I>(method: string, key: string, params: Record<string, string | number | undefined>, cap = Infinity): Promise<{ items: I[]; truncated: boolean }> {
    const items: I[] = [];
    let cursor: string | undefined;
    do {
      const j = await call<{ ok: boolean; error?: string; response_metadata?: { next_cursor?: string } } & Record<string, unknown>>(method, { ...params, cursor });
      items.push(...(((j[key] as I[]) ?? []) as I[]));
      cursor = j.response_metadata?.next_cursor || undefined;
      if (items.length >= cap) return { items: items.slice(0, cap), truncated: true };
    } while (cursor);
    return { items, truncated: false };
  }

  return { call, paginate };
}

export type SlackChannel = { id: string; name: string; is_private: boolean; is_im?: boolean; is_mpim?: boolean; is_member?: boolean; num_members?: number; topic?: { value?: string }; purpose?: { value?: string } };
export type SlackUser = { id: string; name: string; deleted?: boolean; is_bot?: boolean; real_name?: string; profile?: { real_name?: string; display_name?: string; email?: string } };
export type SlackMessage = { type?: string; subtype?: string; user?: string; username?: string; bot_id?: string; text?: string; ts: string; thread_ts?: string; user_profile?: { real_name?: string; display_name?: string; name?: string } };

export const MESSAGE_CAP = 500;

export async function listChannels(c: ReturnType<typeof slackClient>): Promise<SlackChannel[]> {
  const { items } = await c.paginate<SlackChannel>("conversations.list", "channels", { types: "public_channel,private_channel", exclude_archived: "true", limit: 200 });
  return items;
}

export async function listUsers(c: ReturnType<typeof slackClient>): Promise<SlackUser[]> {
  const { items } = await c.paginate<SlackUser>("users.list", "members", { limit: 200 });
  return items;
}

/** Channel history newer than `oldest` (exclusive), newest first from Slack; capped per channel. */
export async function channelHistory(c: ReturnType<typeof slackClient>, channel: string, oldest?: string, cap = MESSAGE_CAP) {
  return c.paginate<SlackMessage>("conversations.history", "messages", { channel, oldest, limit: 200 }, cap);
}
