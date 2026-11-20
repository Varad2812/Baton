# Slack connector

Baton imports Slack channels with their history, maps channel visibility to access levels, keeps a
link from every quote back to its Slack message, and re-syncs only new messages. All three ways in use
one importer (`src/lib/connectors/slack/map.ts` -> `ingestIncremental`), so redaction, chunking,
extraction, quote validation and grading are identical.

| Way in | Who can use it | Needs |
|---|---|---|
| **Import from demo Slack workspace** (Sources) | The project owner; judges need no Slack login | `SLACK_BOT_TOKEN` on the server |
| **Connect Slack** (OAuth v2) (Sources) | The project owner, for their own workspace | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, redirect URL registered |
| **Upload Slack export (.zip)** (Sources and `/new`) | The project owner | nothing; also the fallback when Slack is not configured |

On the sample project, **Try the FestFlow sample export** imports `public/samples/festflow-slack-export.zip`
(built by `npm run slack:sample` from `seed/slack-demo/messages.json`).

## Permissions

| Slack | Baton access | Who sees facts from it |
|---|---|---|
| Public channel | Team | Owner, reviewer, successor |
| Private channel | Restricted | Owner, reviewer; successor only if the owner grants that source |
| Direct / group messages (export only) | Restricted | Owner, reviewer |

The owner can override the level per channel in the channel picker (and later per source on Sources).
Slack users are matched to project people by full name, display name or first name, and their Slack
handles are added to the identity map so chat authors resolve to the right person.

## What is stored

- Messages, after redaction (secrets, emails, phone numbers are replaced before storage, as for every source).
- Per chunk: the permalink and offset of each message (`Chunk.meta.links`), shown as **Open in Slack** in the evidence drawer.
- Per channel: a sync cursor (`SyncState`, provider `slack`, last message ts). **Sync now** fetches only newer messages.
- OAuth workspaces: the bot token, encrypted with AES-256-GCM (`src/lib/crypto.ts`; key `ENCRYPTION_KEY`,
  else derived from `ADMIN_TOKEN`), bound to the visitor who connected it. It is never sent to the browser.

## Limits and errors

- History: up to 500 messages per channel per import, paginated with `cursor`; HTTP 429 waits `Retry-After` (max 30 s, 3 retries).
- Export ZIP: 25 MB upload, 5,000 files, 100 MB unpacked, and the newest 2,000 messages per channel. Messages are imported in chronological order. Path traversal names are ignored.
- A channel Baton is not in shows "In Slack, type /invite @Baton in #channel"; `not_in_channel`,
  `missing_scope`, `invalid_auth` and `token_revoked` each have a plain next step.

## Set up your own Slack app

1. https://api.slack.com/apps -> Create New App -> From scratch.
2. **OAuth & Permissions** -> Bot Token Scopes: `channels:read`, `channels:history`, `groups:read`, `groups:history`, `users:read`.
3. Redirect URL: `https://<your-app>/api/connectors/slack/callback` (for this deployment `https://baton-qxyj.onrender.com/api/connectors/slack/callback`).
4. **Basic Information**: copy Client ID, Client Secret and Signing Secret into `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.
5. Optional: **Event Subscriptions** -> Request URL `https://<your-app>/api/connectors/slack/events`, bot events
   `app_uninstalled`, `tokens_revoked` (marks the connection revoked). Requests are verified with the signing secret (v0 signature, 5-minute window).
6. Other workspaces can use **Connect Slack** only after **Manage Distribution** -> Activate Public Distribution.

OAuth `state` is signed (HMAC) and carries the project, the visitor and a 10-minute expiry; a nonce is also
kept in an httpOnly cookie, and the callback checks all of them before exchanging the code.

## Demo workspace

The demo workspace is used through `SLACK_BOT_TOKEN` only on the server. To fill it with the FestFlow
sample channels (`#festflow-dev`, `#festflow-payments`, private `#core-sponsors`):

1. Add bot scopes `channels:manage`, `channels:join`, `groups:write`, `chat:write`, `chat:write.customize`, reinstall, update `SLACK_BOT_TOKEN`.
2. `npm run slack:seed-demo` (dry run: shows what it will post), then `npm run slack:seed-demo -- --yes`.

Status at submission: the demo token has read scopes only and the bot is in no channel, so the demo
button lists channels but cannot import yet; the sample export ZIP demonstrates the same importer.
On the sample project, the FestFlow sample content uses a prepared extraction (like the FestFlow pipeline
cache) so the result is the same every time; quotes are still re-validated. Any other Slack content goes
through the engine chain (Groq, Gemini, then rule-based).

## Measuring the effect

**Safety checks -> Cross-source verification: Slack** shows the share of facts that are Confirmed (2+
independent sources) graded with and without Slack evidence. For the FestFlow sample export it moves six
single-source facts to Confirmed.
