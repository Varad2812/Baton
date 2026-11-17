# Ask Baton: knowledge base

This file is what the in-app assistant ("Ask Baton") knows about the product. It is sent to the model
with every question, and its FAQ section is also what the offline engine searches when no model is
available. Keep it in plain English and in sync with the UI labels.

## What Baton is

Baton is a knowledge handover tool. When someone leaves a project (a graduating tech lead, a person
changing teams), Baton reads the project's records (GitHub commits, pull requests and issues, chat
exports, docs and meeting notes, task boards), pulls out the facts that matter (decisions, tasks,
risks, owners, contacts, deadlines) and checks every fact against the exact sentence it came from.
It then asks the person leaving only what the records cannot answer, and gives the successor an
approved, role-safe handover with a 7-day and 30-day plan.

Tagline: "Hand over the project, not just the files."

The demo project is **FestFlow**, the registration and ticketing web app of a college cultural fest.
Meera Kulkarni (tech lead, graduating) hands over to Arjun Mehta (incoming lead). Prof. S. Rao is the
faculty reviewer. Kabir Shah is a club member with read-only access. All FestFlow data is synthetic.

## Pages

- **Landing page** (`/`): what Baton is, live numbers from the FestFlow demo, and three ways in:
  "See a finished handover", "Try with your own files" and the "60-second tour".
- **Dashboard** (`/p/festflow`, title "Command centre"): the "Analysis complete" card (what Baton read,
  how many facts it found, how many are confirmed), one big **Next step** button, the decision
  timeline, "Needs attention", "Knowledge at risk" (areas only one person knows), the evidence
  constellation (3D map of sources and facts), the last pipeline run, sources and recent activity.
- **Sources**: the records Baton reads, each labelled Public, Team or Restricted before any AI sees
  them. The owner can add files or a public GitHub repo and click **Run pipeline** to rebuild the
  analysis; the 3D staircase shows each stage live.
- **Facts & evidence** (the evidence ledger): every fact Baton found, with filters for type, grade,
  section, owner and access. Click a row to open the evidence drawer: the exact quote highlighted in
  its original source, and "Why this grade".
- **Conflicts**: two sources disagree about the same thing. A reviewer or the owner picks A, picks B,
  marks both valid, or asks the person leaving. Supersessions ("we moved from X to Y") are shown as
  evolution, not as conflicts.
- **Questions for Meera** (the exit interview): at most 10 questions about what the records cannot
  answer, ranked by risk. Only the owner answers. Each answer is saved as testimony and changes the
  fact's grade (for example Missing to Single source).
- **Review & approve**: the reviewer checks each section, edits or rejects facts, then approves.
  Approval freezes an immutable version (v1, v2, ...) and builds each person's safe view. Open
  conflicts and unanswered top-priority questions block approval unless the reviewer overrides with a
  written note. The owner cannot approve her own handover.
- **Arjun's handover**: the document the successor works from: cover page, approved stamp (or "Draft
  awaiting approval"), sections with superscript citations, a 7-day and a 30-day plan,
  acknowledgements per section, follow-up questions, "N facts hidden, request access", the receipt and
  **Download PDF**.
- **Ask the handover** (`/p/<project>/ask`, also a box at the top of the successor's handover): ask a
  question about the project ("Which payment gateway was chosen?") and get an answer built only from
  the approved handover your role may see. Every sentence carries numbered citations that open the
  evidence. If the records don't say, it replies "This isn't in the approved handover" and the
  successor can send the question to the person leaving in one click; their answer becomes testimony
  and can then be asked again. Before approval it answers from the draft, labelled "Draft — not yet
  approved".
- **Safety checks** (trust report): quote validity by source (every quote re-checked), accuracy vs
  ground truth (the answer key for the demo), the **Leakage matrix** (each role tested for leaks of a
  planted canary string, must be 0), redactions, pipeline runs and the audit log. Buttons:
  **Re-check quotes** and **Run leakage test**.
- **New project** (`/new`): a 4-step wizard (Project, People, Sources, Run) to build a handover from
  your own files or a public GitHub URL. "Try with sample files" loads a small sample project.

## Grades in plain words

- **Confirmed** (shown as "Confirmed (2+ sources)", stored as VERIFIED): backed by an exact quote in
  two or more independent sources, or by one authoritative record such as a merged pull request or
  approved meeting notes.
- **Single source** (SINGLE_SOURCE): backed by exactly one quoted source. Probably right, but nothing
  else confirms it.
- **AI inference** (shown as "AI inference (unconfirmed)", stored as INFERRED): the AI concluded this
  from patterns; no record says it directly. Treat it as a guess until someone confirms. It is shown in
  italics and never styled as fact.
- **Conflicting** (CONFLICTING): two sources disagree and nobody has decided which is right yet.
- **Missing** (MISSING): something a handover needs that no record mentions. Only the person leaving
  can fill it in, through the exit interview.

Testimony (a purple badge) is an answer typed by the person leaving. It counts as one source and is
never mistaken for a record.

## Roles and permissions

There is no login. The **Viewing as** switcher in the top bar picks a persona and every server action
checks it.

| Persona | Role | Sees | Can do |
|---|---|---|---|
| Meera Kulkarni | Owner (departing tech lead) | Everything | Connect and label sources, edit or reject facts, resolve conflicts, answer the exit interview and follow-ups. Cannot approve her own handover. |
| Prof. S. Rao | Reviewer (faculty coordinator) | Everything | Edit or reject facts, resolve conflicts, approve a version. |
| Arjun Mehta | Incoming (successor) | Public and Team facts, plus Restricted sources the owner granted | Read the handover, acknowledge sections, ask follow-ups, request access. |
| Kabir Shah | Observer (club member) | Public facts only | Read only. |

Permissions are enforced on the server before any AI call. A fact is shown only if every source it
cites is visible to the viewer; otherwise it counts as "hidden" and only the number is shown.

## The workflow

1. **Connect**: add sources and label each Public, Team or Restricted.
2. **Reconstruct**: Baton chunks the records, redacts secrets, emails and phone numbers, and extracts
   facts, each citing the quote it came from.
3. **Verify**: every quote is string-matched in its source; facts are graded; conflicts and gaps are
   found against a 12-item handover checklist.
4. **Review**: the owner answers the exit interview; the reviewer resolves conflicts and approves an
   immutable version.
5. **Handover**: each person gets a role-compiled view with a cited 7-day and 30-day plan, and
   acknowledges it section by section.

The 12-item checklist: purpose and current status, how to run and deploy, where code and docs live,
credentials and secrets owner, production accounts and access, open work with owners, key decisions
(last 90 days), external dependencies and vendors, key contacts, recurring problems and fixes,
upcoming deadlines, and who reviews and approves changes.

## Start here guide

The **Start here** panel on the right of every project page has eight steps. Each **Do it** button
switches persona and opens the right page, and ticks itself when done (tracked in the database):

1. See what was found (as Meera, dashboard).
2. Check a fact's evidence (as Prof. Rao, a fact in Facts & evidence).
3. Resolve a conflict (as Prof. Rao, Conflicts).
4. Approve as reviewer (as Prof. Rao, Review & approve).
5. See Arjun's handover (as Arjun).
6. Ask the handover a question (as Arjun, Ask the handover).
7. See knowledge at risk (as Meera, Knowledge at risk), then Simulate new activity on Sources.
8. Import Slack (as Meera, Sources).

Stuck at any point? Click **Ask Baton** in the top bar.

## How to judge in 60 seconds

1. Open the demo. The dashboard shows "Analysis complete" and one **Next step** button.
2. Facts & evidence: open "Auth moved from Firebase to Supabase". The drawer highlights each quote in
   PR #84, the #dev chat of 12 Mar and the 14 Mar notes, and explains why it is Confirmed.
3. Conflicts: switch to Prof. Rao and resolve Razorpay (notes 02-Apr) vs PhonePe (#payments 19-Apr).
4. Review & approve: approve v1 (with an override note if anything is still open).
5. Switch to Arjun and open Arjun's handover, then Safety checks: the leakage matrix shows 0 leaks.

**Reset demo** in the top bar restores the original data in one click.

## FAQ

### What is Baton?
<!-- keywords: baton, what, product, purpose, about, app, tool, overview, explain -->
Baton turns a project's records into a checked handover. It reads commits, chats, docs and task
boards, finds the facts that matter, ties each one to the exact quote it came from, asks the person
leaving only what the records cannot answer, and gives the successor an approved, role-safe plan.

### What does Confirmed mean?
<!-- keywords: confirmed, verified, verify, green, two sources, 2+ sources, grade, trusted -->
Confirmed means the fact is backed by an exact quote in two or more independent sources, or by one
authoritative record such as a merged pull request or approved meeting notes. Every quote is
string-matched in its source by code, not by the AI.

### What does Single source mean?
<!-- keywords: single source, one source, blue, single, only one -->
Single source means exactly one quoted record backs the fact. It is probably right, but nothing else
confirms it yet. Testimony from the person leaving also counts as a single source.

### What does AI inference mean?
<!-- keywords: ai inference, inferred, inference, guess, unconfirmed, amber, italic, pattern -->
AI inference means the AI concluded it from patterns (for example, one person made every commit to an
area), but no record says it directly. It is shown in italics and must be confirmed by a person before
anyone relies on it.

### What does Conflicting mean?
<!-- keywords: conflicting, conflict, red, disagree, contradiction, contradicts -->
Conflicting means two sources disagree about the same topic and nobody has decided which is right. A
reviewer or the owner resolves it on the Conflicts page by picking A, picking B, marking both valid,
or asking the person leaving.

### What does Missing mean?
<!-- keywords: missing, gap, grey, gray, unknown, nobody wrote, not recorded, checklist -->
Missing means the handover checklist needs something that no record mentions, such as who holds the
production database password. Only the person leaving can fill it in, through Questions for Meera.

### What is the difference between a conflict and a supersession?
<!-- keywords: supersession, supersedes, superseded, evolution, replaced, changed, timeline, firebase, supabase -->
A conflict is two sources that disagree with no decision. A supersession is a later decision that
replaced an earlier one (Firebase was replaced by Supabase on 12 Mar). Supersessions are shown as
evolution on the decision timeline, not as conflicts.

### How do I resolve a conflict?
<!-- keywords: resolve, settle, pick, conflict, decide, razorpay, phonepe, payment -->
Open Conflicts as the owner or the reviewer (switch to Prof. Rao in Viewing as). Each conflict shows
both quotes side by side. Click Pick A, Pick B, Both valid, or Ask Meera. You can add an optional note
for the audit log.

### How do I approve the handover?
<!-- keywords: approve, approval, sign off, version, v1, snapshot, override, blocked -->
Switch to Prof. Rao (the reviewer) and open Review & approve. Click Approve as v1. If conflicts or
top-priority questions are still open, approval is blocked; you can tick Override and write a note of
at least 10 characters explaining why. Approval freezes an immutable version.

### Why can't Meera approve?
<!-- keywords: self approval, meera approve, owner approve, cannot approve, why can't -->
The person leaving cannot approve her own handover. Approval belongs to the reviewer (Prof. Rao), so
a second person always signs off.

### How do I switch persona?
<!-- keywords: switch, persona, viewing as, role, login, user, change user, become -->
Use the Viewing as switcher in the top bar. There is no login: it sets a cookie and every server
action checks it. The Start here steps switch persona for you.

### Why are some facts hidden?
<!-- keywords: hidden, request access, cannot see, locked, restricted, missing facts, permission -->
A fact is shown only if every source it cites is visible to your role. Arjun does not see Restricted
sources unless the owner grants them, and Kabir sees Public facts only. Hidden facts are never sent to
your browser or to the AI, only their count. Arjun can click Request access (or Add reason to explain why).

### What are Public, Team and Restricted?
<!-- keywords: public, team, restricted, access level, label, access, sensitive -->
Every source is labelled before any AI sees it. Public is visible to everyone, Team to project
members, and Restricted (for example the sponsor budget sheet) only to the owner and reviewer, or to
the successor if the owner grants that source.

### What is testimony?
<!-- keywords: testimony, purple, answer, interview answer, badge -->
Testimony is an answer typed by the person leaving, in the exit interview or a follow-up. It is saved
as its own source with a purple badge, cited like any other record, and never styled as verified fact.

### How does the exit interview work?
<!-- keywords: interview, questions for meera, exit interview, gap, answer, questions, ask meera -->
Baton runs a 12-item handover checklist against the facts and asks at most 10 questions, ranked by
risk and how many facts depend on each. Only the owner (Meera) answers. Each answer becomes testimony
and the related fact changes grade, for example Missing to Single source.

### How does Baton stop the AI from making things up?
<!-- keywords: hallucinate, hallucination, made up, invent, trust, accurate, accuracy, quote check, receipt -->
The AI must quote its evidence word for word. Code then checks each quote is an exact substring of the
cited source. Evidence that does not match is dropped, and a fact with no valid quote is discarded or
shown as AI inference, never as Confirmed.

### What is the leakage test / canary?
<!-- keywords: leak, leakage, canary, safety checks, trust, matrix, secret, CANARY -->
A unique canary string is planted in a Restricted source. After each role's handover is compiled,
Baton scans it for that string. The Leakage matrix on Safety checks shows the result per role and must
be 0. Click Run leakage test to repeat it.

### Are secrets and personal details redacted?
<!-- keywords: redact, redaction, secret, password, key, token, email, phone, privacy, pii -->
Yes. Secrets, emails and phone numbers are replaced with placeholders before anything is stored or
sent to an AI. Only the fact that a secret existed and who mentioned it is kept, never the value.

### What does Reset demo do?
<!-- keywords: reset, restore, start over, broke, undo, demo reset, clean -->
Reset demo (top bar) restores FestFlow to its original data in one click, so judges cannot break it
for each other. It takes a few seconds.

### What is the Start here panel?
<!-- keywords: start here, guide, steps, where to start, how to start, begin, onboarding, tour -->
Start here is the panel on the right of every project page. Its eight Do it buttons switch persona,
open the right page and tick themselves when done. The 60-second tour on the landing page is the
narrated version.

### How do I judge Baton quickly?
<!-- keywords: judge, judging, demo, quick, 60 seconds, evaluate, try, test it -->
Follow Start here: see what was found, check a fact's evidence, resolve a conflict as Prof. Rao,
approve v1, then open Arjun's handover as Arjun and check Safety checks for 0 leaks.

### What is the successor's handover?
<!-- keywords: handover, arjun, successor, plan, 7 day, 30 day, document, pdf, acknowledge -->
It is the document Arjun works from: an overview, sections with cited facts, a 7-day and a 30-day
plan, and per-section Acknowledge buttons. It is compiled only from facts his role may see. Download
PDF prints it.

### How do I ask a follow-up?
<!-- keywords: follow up, follow-up, ask question, question meera, followup -->
As Arjun, open a fact or a handover section and click Ask follow-up. Meera answers in the follow-up
inbox on Questions for Meera; the answer is saved as testimony on that fact.

### How do I add my own project?
<!-- keywords: new project, own files, upload, github, import, create, my project, wizard -->
Click "Try with your own files" on the landing page (or go to /new). The 4-step wizard takes a name,
the people, your files (.md .txt .csv .json .docx) or a public GitHub URL, then runs the pipeline.

### What does the pipeline do?
<!-- keywords: pipeline, run, stages, extract, process, how it works, staircase -->
Eight stages: ingest, normalise (chunk, label access, redact), extract facts with quotes, validate
quotes, grade, find conflicts, run the gap checklist, and write the interview questions. Progress
streams live on the Sources page.

### What happens if the AI is unavailable?
<!-- keywords: offline, no ai, quota, fails, down, cached, cache, api key, gemini, groq -->
Nothing breaks. The FestFlow demo is preloaded and needs no AI to view. Pipeline runs fall back to a
verified cache or a rule-based extractor, and Ask Baton falls back to an offline engine that answers
from this guide and the project's counts.

### What is the Draft button?
<!-- keywords: draft, write, help me write, pen, rephrase, notes, wording -->
Text boxes have a small Draft button. It turns your rough notes into a clear sentence using only the
facts on screen that your role may see. For interview and follow-up answers it only rephrases your own
notes and never invents facts; answers written with help are labelled "drafted with assistant,
confirmed by" the person who sent them. Nothing is submitted until you click the normal button.

### What is the difference between Ask Baton and Ask the handover?
<!-- keywords: ask the handover, ask baton, difference, q&a, question, project question, cited answer, which one -->
Ask Baton (this panel) explains how to use Baton: pages, grades, roles and buttons. Ask the handover
answers questions about the project itself, such as who owns a task or why a decision was made. It
only uses the approved handover your role may see and cites every sentence. Open it from the sidebar
(Ask the handover) or the box at the top of the successor's handover.

### Why was my question refused?
<!-- keywords: refused, not in the handover, isn't in, cannot answer, no answer, refusal, known gap -->
Ask the handover only answers from the approved handover your role may see. If no fact or quote
matches, or the handover lists it as a known gap (for example who holds a password), it says "This
isn't in the approved handover". The successor can then click Ask (the person leaving) to send it as
a follow-up; the answer becomes testimony and can be asked again.

### How are answers checked?
<!-- keywords: citation, citations, checked, validator, sources, numbered, trust answer, hallucination q&a -->
Every sentence must cite a numbered source from the facts and excerpts your role may see. Code removes
any sentence without a valid citation or with quoted words that are not in the cited source, scans the
answer for restricted text and canary strings, and refuses on a hit. The Q&A safety card on Safety
checks shows answers given, refused, citation validity and leaks.

### What does the evidence drawer show?
<!-- keywords: evidence, drawer, quote, highlight, source, why this grade, open source -->
Click any fact to open it. The drawer shows each supporting quote highlighted inside its original
source, any contradicting quote, the grade and why it got that grade, and Open source to read the full
record.

## Limitations

- The demo uses a small free AI quota, so the FestFlow analysis is served from a verified cache; live
  runs are a bonus.
- Identity is a persona switcher without login, by design for judging. Real use needs single sign-on.
- Connectors today: public GitHub repos and file uploads (.md .txt .csv .json .docx).
- Ask Baton only knows Baton and the current project. It does not browse the web, and it never sees
  facts your role cannot see.
- Ask Baton keeps the conversation in your browser tab only; nothing you type into it is stored.
