# Security and data handling

Baton's promise is that a handover never shows someone a fact they may not see, and never presents a
guess as a fact. These are the mechanisms, and where they live.

## What is stored

| Stored | Not stored |
|---|---|
| Source text after redaction (chunks of ~800 characters with locators) | Raw secret values, emails or phone numbers |
| Redaction records: kind, placeholder, who mentioned it | The redacted values themselves |
| Facts, quotes, grades, conflicts, questions, answers (testimony), versions | Ask Baton conversations (browser tab only) |
| Audit log of every mutation (actor, action, target, small metadata) | The text of questions asked in Ask the handover (only counts) |
| Slack OAuth bot tokens, AES-256-GCM encrypted, bound to one visitor | Passwords or login credentials (there is no login) |
| Model answers by hash (`LlmCache`) | Anything about visitors beyond a random id |

Visitor copies of the sample expire 24 hours after last use; projects created in `/new` expire after
7 idle days and can be deleted by their creator at any time.

## Redaction before storage and before any model call

`src/lib/pipeline/normalise.ts` (`Redactor`) replaces secrets (generic `KEY=`/token patterns, high-entropy
strings, known prefixes), emails and phone numbers with placeholders as items are chunked, for every
ingest path: uploads, PDFs, GitHub, Slack (API and export), testimony, and incremental syncs. Model
outputs are passed through the redactor again before they are shown.

## Permissions on the server

`src/lib/authz.ts`: `getActor()`, `can(role, action)`, `assertCan`, `allowedAccess(role, projectId)`,
`canSeeChunk`, `canSeeClaim`. Every route handler and server action resolves the project
(`resolveProject`: a visitor can only open their own sandbox and their own `/new` projects) and checks the
action before any query or model call. A fact is visible only if every chunk it cites is visible.
Hidden facts never leave the server: pages, exports, Q&A, the assistant and the share page receive counts only.

## Role compilation and canaries

`src/lib/handover/compile.ts`: each role's view is compiled from the facts it may see; the writer model
receives only those facts and quotes. Afterwards the output is scanned for:
- every canary string (`CANARY-…`) found in chunks the role cannot see (the sample plants
  `CANARY-RM-7F3A` in the restricted budget sheet and `CANARY-SL-9C2E` in a private Slack channel), and
- every quote of a hidden fact.

Any hit discards the model text and uses the deterministic template. **Safety checks** recompiles every
role and shows the leakage matrix (must be 0). The same scan runs on every Ask the handover answer, every
Ask Baton answer and every Draft.

## Answers cannot invent sources

- Pipeline: quotes must be exact substrings of the cited chunk (normalised for whitespace, case and smart
  quotes); invalid evidence is dropped; a fact with no valid quote is discarded or marked AI inference.
- Ask the handover (`src/lib/ask/validate.ts`): every sentence must cite numbered sources from the allowed
  set; a sentence without a citation, with an unknown citation, or with quoted words not found in a cited
  source is removed. No usable sentence → "This isn't in the approved handover".

## Tokens and signatures

| What | How |
|---|---|
| Visitor cookie `baton_vid` | `id.HMAC-SHA256`, httpOnly, SameSite=Lax, Secure on HTTPS; the proxy overwrites any client-sent `x-baton-vid` header |
| Slack OAuth tokens | AES-256-GCM, random 96-bit IV, auth tag (`src/lib/crypto.ts`); key `ENCRYPTION_KEY`, else derived from `ADMIN_TOKEN` |
| Slack OAuth `state` | HMAC-signed `{nonce, project, visitor, expiry 10 min}` + nonce in an httpOnly cookie; all checked on callback |
| Slack events | v0 signature over `v0:<ts>:<body>` with `SLACK_SIGNING_SECRET`, 5-minute window, constant-time compare |
| GitHub webhook | `X-Hub-Signature-256` HMAC with `GITHUB_WEBHOOK_SECRET`, constant-time compare; 503 when unset |
| Share links | HMAC-signed `{project, version, expiry 7 days}`; shows only the successor's stored view |
| Admin cleanup | `Authorization: Bearer $ADMIN_TOKEN`, constant-time compare |

## Abuse limits

Per-IP limits on Ask Baton, Ask the handover, drafts and `/new`; 20 resets per minute per visitor; one
pipeline run or sync per project at a time (database lock); in-flight guards so double clicks cannot
create duplicate approvals, resolutions or answers; upload, ZIP and history size caps.

## Known gaps

- Personas are a demo device. Real deployments need single sign-on and real membership (see ROADMAP.md).
- Share links cannot be revoked before they expire (stateless); invite links with revocation are on the roadmap.
- Redaction is pattern-based and can miss unusual secret formats; it errs towards over-redaction.
