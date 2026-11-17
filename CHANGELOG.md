# Changelog

## Round 3 polish (2026-11-18): simpler to understand on first open

After a first-time user said every page showed too much, the information architecture was rebuilt
without removing any feature:
- **Journey navigation.** The sidebar groups pages by the handover journey (Overview · 1 Collect ·
  2 Understand · 3 Fill gaps · 4 Approve · 5 Hand over) with a done / in-progress dot per step, and each
  persona sees its own pages first; the rest sit under **More**. The 5-stage stepper row was removed.
- **Calm Home.** "You are X. Your job: …", one role-aware **Next step**, the Analysis complete summary and
  three status tiles. Timeline, the 3D evidence map, activity and the last run moved to **Insights**.
- **Sources.** A big **Add sources** button opens a full-page flow (Upload files · Import from GitHub ·
  Import from Slack, with demo workspace / Connect / export inside). The table gives the title the most
  room, with a **Columns** menu for low-value columns; Keep it current and Pipeline runs are tabs.
- **One job per page.** Title, one sentence, at most one primary button, at most two columns; secondary
  detail in tabs (Conflicts, Questions, Knowledge at risk, Safety checks) or a disclosure (Ask, Facts
  filters on small screens). The "Try this" strips were removed; handover exports sit in one
  **Share & export** menu.
- **Help.** Tour and Glossary moved into a **Help** menu; Start here became a "Guide 2/8" pill that opens a
  drawer (closed by default). The assistant's Draft button is now **Smart Draft**.
- The demo Slack workspace import was verified on the live site (67 → 88 facts, 3 → 5 conflicts).

## Round 3 (2026-11-17): the three promised improvements, and real-world readiness

**Promised at Round 2, delivered**
- **Ask the handover** (A1): cited Q&A over the approved handover your role may see. BM25 retrieval,
  citation validator, canary scan on every answer, "This isn't in the approved handover" with one-click
  Ask the owner (answer becomes testimony), draft labelling, offline extractive fallback, Trust "Q&A safety".
- **Knowledge-at-risk radar + continuous handover** (A2): per-area and per-person risk with one action
  each, interactive 3D towers; incremental GitHub sync (cursors, ETag, signed webhook); change detection
  against the approved version; out-of-date banner; Draft v2 with only the changes; "What changed since
  v1"; "v2 new" badge; Simulate new activity on the sample.
- **Slack connector** (A3): demo workspace, OAuth v2 (encrypted tokens, signed state), export ZIP;
  public → Team, private/DM → Restricted with override; Open in Slack; re-sync by ts; Trust before/after.

**Completeness and reliability**
- Per-visitor sandboxes of the sample (signed anonymous cookie, 24 h), Reset demo resets only your copy;
  `/new` projects private to their creator; scheduled cleanup.
- Role-aware Next step, "facts" wording everywhere, Start here (8 steps, tracked in the database),
  9-step tour, first-visit welcome.
- PDF uploads (scanned and locked PDFs explained), Slack export in `/new`.
- Markdown / JSON exports with citations and links; signed read-only share link.
- Idempotency (in-flight guards, expected version on approve, upload hashing), one run per project
  (database lock), progress that survives a refresh, per-page error boundaries, fetch timeouts, JSON logs,
  `/api/health` + `/status`.
- Accessibility: axe reports 0 serious/critical issues (contrast tokens, names, roles).
- Judge-alone Playwright suite, local-DB test gate (`npm run check`), docs set, `npm run setup`, Docker Compose.

## Round 2 (2026-11-15): the working product

- Pipeline: ingest (files, public GitHub), normalise with redaction, extraction with verbatim quotes,
  deterministic quote validation, grading, conflicts vs supersessions, 12-item gap checklist, ranked
  interview questions. Groq → Gemini → rule-based engine chain with cache and budgets; FestFlow verified cache.
- Evidence ledger and drawer, conflicts, exit interview (testimony), review and approval (immutable
  versions, no self-approval, override notes, diffs), role-compiled handover with 7/30-day plan,
  acknowledgements, follow-ups, receipt, Trust page (quote validity, ground-truth accuracy, leakage matrix).
- `/new` wizard, guided tour, Start here, Ask Baton assistant and Draft helper, 3D hero, staircase and
  evidence constellation.
- Tests: 219 unit, 5 e2e, 16 QA.

## Round 1 (2026-11-14): the plan

- Problem: handovers lose the "why" and the "who"; successors inherit files, not knowledge.
- Plan: rebuild a project's state from authorised sources, grade every claim against an exact quote, ask
  the departing person only what the records cannot answer, and give each successor a role-safe plan.
- Promised for Round 3 (from the Round 2 roadmap): grounded Q&A on the approved handover, a
  knowledge-at-risk radar with incremental re-sync, and a Slack connector.
