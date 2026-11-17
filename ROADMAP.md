# Roadmap: the next 3 months

Goal for the quarter: move Baton from a judged demo to a tool **three real student and research teams
use for their semester-end handovers** (December 2026 to February 2027), and prove it with numbers.

## Month 1 (December 2026): real teams, real identity

| Milestone | Done when |
|---|---|
| Sign-in with Google / GitHub (Auth.js) replacing the persona switcher outside the demo | A team of 4 signs in with their own accounts; roles come from membership |
| Invite links per role with expiry and revocation (hashed tokens) | Owner invites a reviewer and a successor; revoking cuts access on the next request |
| Pilot onboarding: 3 teams (college fest club, a research lab, a startup team) | Each has connected at least GitHub + one chat source |
| Handover templates per setting (club, lab, startup checklists) | The lab template asks about datasets, compute and supervisors |

Success metrics: 3 pilot projects created; 80% of their sources connected without our help;
median time from sign-up to first approved draft under 30 minutes.

## Month 2 (January 2027): depth where pilots hurt

| Milestone | Done when |
|---|---|
| Google Drive and Notion connectors (same importer and access mapping as Slack) | Docs from both appear with links back and inherited sharing levels |
| Scheduled sync (hourly) and Slack Events (new messages arrive without Sync now) | A message posted in Slack shows up as a new fact within the hour |
| Ask the handover in Slack (`/ask-baton`), answering with the same validator and access rules | Successor asks in Slack and gets a cited answer or "not in the handover" |
| Evaluation set: 150 real questions from pilots with expected sources | Answer citation precision ≥ 95%, refusal precision ≥ 90%, 0 leaks |

Success metrics: at least 20 questions per pilot answered from the handover; fewer than 10% of answers
reported wrong by users; zero access-level leaks in audits.

## Month 3 (February 2027): handovers that stay true

| Milestone | Done when |
|---|---|
| Live radar alerts: notify the reviewer when a bus factor drops to 1 or a decision has one source for 30 days | Alert arrives with the action ("Ask Kabir to document scanner") |
| Successor feedback loop: "this was wrong / outdated" on any fact, routed to the owner | Corrections become testimony and update the next version |
| Self-hosting guide hardened (Docker image, backups, SSO config) | A lab IT admin deploys it in under an hour following docs only |
| Pilot report: before/after time-to-productivity for each successor | Published with the pilots' consent |

Success metrics: successors rate the handover ≥ 4/5; at least one pilot runs a second handover cycle
on its own; median time for a successor to make a first independent change down by a third versus the
team's previous handover.

## Risks and dependencies

| Risk | Mitigation |
|---|---|
| Model quality and free-tier quotas | Engine chain with cache and rule-based fallback already in place; budget per run; evaluation set catches regressions |
| Access mistakes would destroy trust | Server-side checks, canary scans and the leakage matrix stay mandatory in CI; audit every export and share |
| Pilot teams do not have time | Ship the "60-minute handover" path: connect, answer the top 5 questions, approve |
| Connector API changes (Slack, Drive) | One importer per source behind the same interface; contract tests with recorded fixtures |
| Hosting limits on the free tier | Move to a paid Render instance + managed Postgres once pilots start (≈ USD 25/month) |

Dependencies: Google and Notion API approval for public apps; Slack app review for public distribution;
a faculty sponsor for the research-lab pilot.
