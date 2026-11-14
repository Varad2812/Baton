// Hand-authored expected pipeline output for FestFlow.
// Evidence cites a SOURCE key plus a verbatim quote; seed/build-cache.ts resolves the
// exact chunk and offsets and fails if any quote is not found.

import type {
  ClaimStatus,
  ClaimType,
  ConflictKind,
  ConflictStatus,
  EvidenceRelation,
  GapKind,
  Grade,
  Resolution,
} from "../../src/generated/prisma/enums";

export type PersonKey = "meera" | "arjun" | "rao" | "kabir" | "sana" | "dev";

export type EvidenceSpec = {
  source: string;
  quote: string;
  relation?: EvidenceRelation;
};

export type ClaimSpec = {
  id: string;
  type: ClaimType;
  section: string;
  title: string;
  statement: string;
  topicKey: string;
  owner?: PersonKey;
  date?: string;
  grade: Grade;
  gradeReason: string;
  status?: ClaimStatus;
  reviewerNote?: string;
  isInference?: boolean;
  fromTestimony?: boolean;
  evidence: EvidenceSpec[];
};

export const SECTIONS = [
  "Purpose & status",
  "Run & deploy",
  "Code & docs",
  "Access & secrets",
  "Open work",
  "Decisions",
  "Vendors & dependencies",
  "Contacts",
  "Recurring problems",
  "Deadlines",
  "Review & approval",
  "Risks",
] as const;

export const CLAIMS: ClaimSpec[] = [
  /* ------------------------------ Purpose ------------------------------ */
  {
    id: "clm_purpose",
    type: "DECISION",
    section: "Purpose & status",
    title: "FestFlow runs registration and ticketing for Kalrav 2026 (30 Apr – 2 May)",
    statement:
      "FestFlow handles registration, team sign-ups, payments, QR e-tickets and gate check-in for Kalrav 2026 at VCE Pune: 41 events over 30 April – 2 May, 6,000+ expected attendees. 2,740 registrations by 14 Mar.",
    topicKey: "purpose",
    date: "2026-03-14",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: README.md, #general 18-Apr, notes 14-Mar (approved)",
    evidence: [
      { source: "src_doc_readme", quote: "gate check-in for 41 events and an expected 6,000+ attendees" },
      { source: "src_chat_general", quote: "Fest dates are 30 April to 2 May. No changes." },
      { source: "src_notes_0314", quote: "2,740 registrations so far." },
    ],
  },

  /* ----------------------------- Decisions ----------------------------- */
  {
    id: "clm_auth_supabase",
    type: "DECISION",
    section: "Decisions",
    title: "Auth moved from Firebase to Supabase on 12 Mar",
    statement:
      "Participant login moved from Firebase Authentication to Supabase Auth (magic link + Google) on 12 Mar 2026 because the Firebase free tier hit limits during fest sign-ups. 1,912 existing users were imported.",
    topicKey: "auth_provider",
    owner: "meera",
    date: "2026-03-12",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: PR #84 (merged), #dev 12-Mar, notes 14-Mar (approved)",
    evidence: [
      { source: "src_pr_84", quote: "Firebase free tier hit limits during fest sign-ups: the daily email-link quota ran out on 9 and 11 March" },
      { source: "src_chat_dev", quote: "Moving auth to Supabase today, PR #84." },
      { source: "src_chat_dev", quote: "Merged. Auth is on Supabase now. Imported 1,912 Firebase users." },
      { source: "src_notes_0314", quote: "Auth moved from Firebase to Supabase on 12 Mar. Firebase free tier hit limits during fest sign-ups" },
    ],
  },
  {
    id: "clm_auth_firebase",
    type: "DECISION",
    section: "Decisions",
    title: "Auth on Firebase Authentication (January plan)",
    statement:
      "In January the team chose Firebase Authentication (Google sign-in + email link) and the API verified Firebase ID tokens. Superseded on 12 Mar by Supabase; README still describes this.",
    topicKey: "auth_provider",
    owner: "meera",
    date: "2026-01-06",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: architecture.md, README.md, #dev 06-Jan (superseded 12-Mar)",
    evidence: [
      { source: "src_doc_architecture", quote: "We use Firebase Authentication for participant login (Google sign-in and email link)." },
      { source: "src_doc_readme", quote: "Auth: Firebase Authentication (Google sign-in and email link)" },
      { source: "src_chat_dev", quote: "Auth plan: we use Firebase Authentication, Google sign-in + email link." },
    ],
  },
  {
    id: "clm_hosting_render",
    type: "DECISION",
    section: "Decisions",
    title: "Hosting moved from Vercel to Render on 14 Feb",
    statement:
      "Web and API moved from Vercel to Render (two web services plus Postgres) on 14 Feb because Vercel's hobby plan does not allow commercial use and the club sells tickets.",
    topicKey: "hosting",
    owner: "meera",
    date: "2026-02-14",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: PR #41 (merged), notes 10-Feb, #dev 14-Feb",
    evidence: [
      { source: "src_pr_41", quote: "Vercel's hobby plan does not allow commercial use and we are selling tickets." },
      { source: "src_notes_0210", quote: "Decision: move web and api to Render as two services; Postgres also on Render." },
      { source: "src_chat_dev", quote: "Done. web and api are on Render, Postgres too. Vercel project paused." },
    ],
  },
  {
    id: "clm_hosting_vercel",
    type: "DECISION",
    section: "Decisions",
    title: "Hosted on Vercel with per-PR previews (stale)",
    statement: "README says the app is hosted on Vercel with a preview deploy per PR. Superseded by the move to Render on 14 Feb.",
    topicKey: "hosting",
    date: "2026-01-05",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: README.md (not updated since January)",
    evidence: [{ source: "src_doc_readme", quote: "Hosting: Vercel, with a preview deploy for every PR" }],
  },
  {
    id: "clm_email_resend",
    type: "DECISION",
    section: "Decisions",
    title: "Transactional email moved from Gmail SMTP to Resend",
    statement:
      "All FestFlow mail is sent through Resend since 6 Feb; Gmail SMTP throttled the club account at about 100 mails a day.",
    topicKey: "email_provider",
    owner: "meera",
    date: "2026-02-06",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: PR #29 (merged), #dev 06-Feb",
    evidence: [
      { source: "src_pr_29", quote: "Gmail SMTP throttles the club account at around 100 mails a day" },
      { source: "src_chat_dev", quote: "Resend is live for all FestFlow mail. PR #29." },
    ],
  },
  {
    id: "clm_email_gmail",
    type: "DECISION",
    section: "Decisions",
    title: "Email sent through Gmail SMTP (January)",
    statement: "architecture.md says email is sent via Gmail SMTP from the club account. Superseded by Resend on 6 Feb.",
    topicKey: "email_provider",
    date: "2026-01-18",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: architecture.md (18-Jan)",
    evidence: [{ source: "src_doc_architecture", quote: "Currently Gmail SMTP from the club account." }],
  },
  {
    id: "clm_payment_razorpay",
    type: "DECISION",
    section: "Decisions",
    title: "Payment gateway: Razorpay (decided 2 Apr)",
    statement:
      "The 2 Apr committee meeting, approved by Prof. Rao, chose Razorpay for its lower setup fee. Dev is completing KYC with the club's bank account.",
    topicKey: "payment_gateway",
    owner: "dev",
    date: "2026-04-02",
    grade: "CONFLICTING",
    gradeReason: "Approved notes 02-Apr say Razorpay; #payments 19-Apr shows a PhonePe trial in progress",
    evidence: [
      { source: "src_notes_0402", quote: "Final: go with Razorpay, lower setup fee" },
      { source: "src_chat_payments", quote: "Decision from today's meeting: Razorpay, lower setup fee. Starting KYC." },
    ],
  },
  {
    id: "clm_payment_phonepe",
    type: "DECISION",
    section: "Decisions",
    title: "PhonePe trial started as payment gateway (19 Apr)",
    statement:
      "On 19 Apr Dev received PhonePe trial credentials and started testing. Arjun built a PhonePe adapter behind PAYMENT_PROVIDER (draft PR #93) as a backup if Razorpay KYC does not clear.",
    topicKey: "payment_gateway",
    owner: "dev",
    date: "2026-04-19",
    grade: "CONFLICTING",
    gradeReason: "#payments 19-Apr and PR #93 contradict the approved 02-Apr decision for Razorpay",
    evidence: [
      { source: "src_chat_payments", quote: "PhonePe trial creds came today, testing this week" },
      { source: "src_pr_93", quote: "Backup in case Razorpay KYC does not clear in time." },
      { source: "src_chat_payments", quote: "PhonePe adapter is behind the PAYMENT_PROVIDER flag, PR #93." },
    ],
  },
  {
    id: "clm_regclose_25",
    type: "DECISION",
    section: "Deadlines",
    title: "Registrations close 25 April, 11:59 pm",
    statement:
      "The 14 Mar meeting set registrations to close on 25 April at 11:59 pm IST. REGISTRATION_CLOSES_AT on Render and the home-page countdown use this date.",
    topicKey: "registration_close",
    owner: "arjun",
    date: "2026-03-14",
    grade: "CONFLICTING",
    gradeReason: "Notes 14-Mar and PR #88 say 25 Apr; #general 08-Apr announced 28 Apr",
    evidence: [
      { source: "src_notes_0314", quote: "Registrations close 25 April, 11:59 pm." },
      { source: "src_pr_88", quote: "set to 2026-04-25T23:59+05:30 as agreed in the 14 Mar meeting" },
      { source: "src_trello", quote: "Closes 25 Apr 23:59 IST (REGISTRATION_CLOSES_AT)." },
    ],
  },
  {
    id: "clm_regclose_28",
    type: "DECISION",
    section: "Deadlines",
    title: "Registrations close 28 April (public announcement)",
    statement:
      "Dev announced to everyone on #general on 8 Apr that registrations close on 28 April. The site countdown still says 25 April.",
    topicKey: "registration_close",
    owner: "dev",
    date: "2026-04-08",
    grade: "CONFLICTING",
    gradeReason: "#general 08-Apr says 28 Apr; contradicts notes 14-Mar and the live countdown",
    evidence: [
      { source: "src_chat_general", quote: "Registrations for Kalrav 2026 close on 28 April. Spread the word in your hostels." },
      { source: "src_chat_general", quote: "site countdown still says 25 April, which one is right?", relation: "CONTRADICTS" },
    ],
  },
  {
    id: "clm_refund_15",
    type: "DECISION",
    section: "Decisions",
    title: "Refunds allowed until 15 April",
    statement:
      "architecture.md sets the refund policy as full refund on request until 15 April, none after. The refund flow in PR #95 defaults REFUND_CUTOFF to this date.",
    topicKey: "refund_cutoff",
    date: "2026-01-18",
    grade: "CONFLICTING",
    gradeReason: "architecture.md and PR #95 say 15 Apr; Trello and #general say 20 Apr",
    evidence: [
      { source: "src_doc_architecture", quote: "full refund on request until 15 April 2026; no refunds after 15 Apr." },
      { source: "src_pr_95", quote: "defaulting to 2026-04-15 as in architecture.md" },
    ],
  },
  {
    id: "clm_refund_20",
    type: "DECISION",
    section: "Decisions",
    title: "Refunds allowed until 20 April",
    statement: "The Trello refund card and the treasurer's public replies say refund requests are accepted until 20 April.",
    topicKey: "refund_cutoff",
    owner: "dev",
    date: "2026-04-11",
    grade: "CONFLICTING",
    gradeReason: "Trello FF-104, #payments 11-Apr and #general 22-Apr say 20 Apr; contradicts architecture.md",
    evidence: [
      { source: "src_trello", quote: "Refund requests: allow until 20 Apr (per Dev). PR #95." },
      { source: "src_chat_payments", quote: "Trello says 20 April for refunds btw, I told people 20" },
      { source: "src_chat_general", quote: "Refund requests are open till 20 April as per the policy" },
    ],
  },
  {
    id: "clm_team_size",
    type: "DECISION",
    section: "Decisions",
    title: "Max team size for group events is 6",
    statement: "The committee capped group-event teams at 6 members on 14 Mar; the API enforces it since 18 Mar.",
    topicKey: "team_size",
    owner: "arjun",
    date: "2026-03-14",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: notes 14-Mar (approved), Issue #79, #general 15-Mar",
    evidence: [
      { source: "src_notes_0314", quote: "Max team size for group events: 6 members." },
      { source: "src_issue_79", quote: "Committee decided on 14 Mar: max team size for group events is 6." },
      { source: "src_chat_general", quote: "Team events: max 6 members per team, confirmed by the committee." },
    ],
  },
  {
    id: "clm_early_bird",
    type: "DECISION",
    section: "Decisions",
    title: "Early-bird pass ₹299 until 31 Mar, then ₹399",
    statement: "Early-bird pricing ran until 31 Mar 23:59 IST (EARLY_BIRD_ENDS_AT); passes are ₹399 after. Team events are priced per team.",
    topicKey: "pricing",
    owner: "arjun",
    date: "2026-03-08",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: PR #71 (merged), notes 10-Feb, #general 20-Feb",
    evidence: [
      { source: "src_pr_71", quote: "Early-bird pass is ₹299 until 31 Mar 23:59 IST, then ₹399." },
      { source: "src_notes_0210", quote: "Early-bird pass ₹299 until 31 Mar, then ₹399. Team events priced per team, not per head." },
      { source: "src_chat_general", quote: "Early-bird pass is ₹299 till 31 March, then ₹399." },
    ],
  },
  {
    id: "clm_feature_freeze",
    type: "DECISION",
    section: "Deadlines",
    title: "Feature freeze from 20 April; every fix needs a reviewer",
    statement: "From 20 April only bug fixes are merged, and each one needs a reviewer.",
    topicKey: "feature_freeze",
    date: "2026-04-20",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: notes 02-Apr (approved), #dev 20-Apr",
    evidence: [
      { source: "src_notes_0402", quote: "Feature freeze on 20 April. After that only bug fixes, and each one needs a reviewer." },
      { source: "src_chat_dev", quote: "feature freeze is on. Only bug fixes from now, each needs a reviewer." },
    ],
  },
  {
    id: "clm_qr_hmac",
    type: "DECISION",
    section: "Decisions",
    title: "Tickets are HMAC-signed QR codes verified offline",
    statement:
      "Each ticket QR encodes ticketId.signature (HMAC-SHA256 with TICKET_SIGNING_SECRET) so the scanner PWA can verify tickets without network.",
    topicKey: "ticket_signing",
    owner: "meera",
    date: "2026-03-05",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: PR #66 (merged), #dev 05-Mar",
    evidence: [
      { source: "src_pr_66", quote: "The scanner can verify tickets without network." },
      { source: "src_chat_dev", quote: "QR payload is now ticketId.signature with HMAC-SHA256 (PR #66)." },
    ],
  },
  {
    id: "clm_scanner_pwa",
    type: "DECISION",
    section: "Decisions",
    title: "Gate check-in uses the scanner PWA on volunteers' own phones",
    statement: "No native app: gate volunteers run the scanner PWA on their own phones, with an offline check-in queue that syncs later.",
    topicKey: "gate_checkin",
    date: "2026-02-10",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: notes 10-Feb, PR #58 (merged), #general 12-Apr",
    evidence: [
      { source: "src_notes_0210", quote: "Gate check-in will be the PWA, not a native app. Volunteers use their own phones." },
      { source: "src_pr_58", quote: "Check-ins are stored in IndexedDB and synced when the network comes back." },
      { source: "src_chat_general", quote: "You'll use your own phone." },
    ],
  },
  {
    id: "clm_review_rule",
    type: "DECISION",
    section: "Review & approval",
    title: "Every PR needs one approval from Meera before merge",
    statement: "README and Meera's reminder in #dev require one approval from @meera-k on every PR, however small.",
    topicKey: "review_rule",
    owner: "meera",
    date: "2026-03-03",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: README.md, #dev 03-Mar",
    evidence: [
      { source: "src_doc_readme", quote: "get one approval from @meera-k before merging" },
      { source: "src_chat_dev", quote: "reminder: PRs need one approval from me before merge, even small ones" },
    ],
  },

  /* ------------------------------ Open work ---------------------------- */
  {
    id: "clm_task_kyc",
    type: "TASK",
    section: "Open work",
    title: "Razorpay KYC still pending (due 15 Apr)",
    statement: "Razorpay rejected the bank proof once and now wants the club registration certificate from the Dean's office. Live keys are blocked until KYC clears.",
    topicKey: "razorpay_kyc",
    owner: "dev",
    date: "2026-04-15",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: Trello FF-101, #payments 15-Apr",
    evidence: [
      { source: "src_trello", quote: "Rejected once for bank proof. Needs the club registration certificate from the Dean's office." },
      { source: "src_chat_payments", quote: "Razorpay KYC still pending, they rejected the bank proof once" },
    ],
  },
  {
    id: "clm_task_db_upgrade",
    type: "TASK",
    section: "Open work",
    title: "Upgrade Render Postgres to a paid plan before 25 Apr (unassigned)",
    statement: "The production database is on Render's free plan. Upgrading needs the treasurer's approval; nobody is assigned.",
    topicKey: "db_upgrade",
    date: "2026-04-25",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: Issue #61, Trello FF-106",
    status: "EDITED",
    reviewerNote: "Spend approved in principle; Dev to pay from the tech line. Arjun to do the upgrade.",
    evidence: [
      { source: "src_issue_61", quote: "Upgrade to a paid plan needs the treasurer's approval." },
      { source: "src_trello", quote: "Free instance expires 27 Apr. Needs Dev's approval for the spend." },
    ],
  },
  {
    id: "clm_task_refunds",
    type: "TASK",
    section: "Open work",
    title: "Refund flow in the admin desk is in review (PR #95)",
    statement: "Admin desk refund list with approve/reject is open as PR #95; the cutoff date is configurable and undecided.",
    topicKey: "refund_flow",
    owner: "arjun",
    date: "2026-04-11",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: PR #95 (open)",
    evidence: [{ source: "src_pr_95", quote: "Admin desk list of refund requests with approve and reject." }],
  },
  {
    id: "clm_task_load_retest",
    type: "TASK",
    section: "Open work",
    title: "Re-run the 300 rps load test after the DB upgrade",
    statement: "Kabir will re-run the k6 registration load test once the paid Postgres plan is live.",
    topicKey: "load_test",
    owner: "kabir",
    date: "2026-04-18",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: Issue #35, Trello FF-105",
    evidence: [
      { source: "src_issue_35", quote: "Will re-run after the paid DB upgrade." },
      { source: "src_trello", quote: "Re-run after paid Postgres." },
    ],
  },
  {
    id: "clm_task_volunteers",
    type: "TASK",
    section: "Open work",
    title: "Gate volunteer onboarding and scanner guide (due 26 Apr)",
    statement: "Kabir is preparing onboarding for gate volunteers, including testing the scanner on iOS Safari.",
    topicKey: "volunteer_onboarding",
    owner: "kabir",
    date: "2026-04-26",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: Trello FF-111",
    evidence: [{ source: "src_trello", quote: "FF-111 · Gate volunteer onboarding + scanner guide" }],
  },
  {
    id: "clm_task_readme",
    type: "TASK",
    section: "Code & docs",
    title: "README still says Firebase and Vercel",
    statement: "README lists Firebase Authentication and Vercel; both were replaced. Arjun owns the update (Issue #90, due 27 Apr).",
    topicKey: "readme_update",
    owner: "arjun",
    date: "2026-04-05",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: Issue #90, Trello FF-112",
    evidence: [
      { source: "src_issue_90", quote: "README lists Firebase Authentication and Vercel." },
      { source: "src_trello", quote: "Update README (still says Firebase + Vercel)" },
    ],
  },
  {
    id: "clm_task_handover",
    type: "TASK",
    section: "Open work",
    title: "Written handover from Meera, approved before she leaves",
    statement: "Prof. Rao asked for a written handover from Meera before she graduates in May; Arjun takes over.",
    topicKey: "handover_doc",
    owner: "meera",
    date: "2026-04-28",
    grade: "VERIFIED",
    gradeReason: "Authoritative source: notes 14-Mar (approved); also Trello FF-114",
    evidence: [
      { source: "src_notes_0314", quote: "Prof. Rao asked for a written handover from Meera before she leaves" },
      { source: "src_trello", quote: "Prof. Rao wants it approved before Meera leaves." },
    ],
  },
  {
    id: "clm_task_csv_export",
    type: "TASK",
    section: "Open work",
    title: "Help-desk CSV export of registrations (unassigned)",
    statement: "Help desk volunteers need a per-event registrations CSV as a fallback when the scanner is down. Not started.",
    topicKey: "csv_export",
    date: "2026-04-21",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: Issue #99",
    evidence: [{ source: "src_issue_99", quote: "Help desk volunteers need a CSV of registrations per event to check people in when the scanner is down." }],
  },
  {
    id: "clm_task_cash",
    type: "TASK",
    section: "Open work",
    title: "Reconcile 37 cash-desk passes once the gateway is live",
    statement: "Dev collected cash for 37 passes at the desk while payments were disabled and will reconcile them after the gateway goes live.",
    topicKey: "cash_reconcile",
    owner: "dev",
    date: "2026-03-20",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #payments 20-Mar",
    evidence: [{ source: "src_chat_payments", quote: "Cash collected at the desk so far: 37 passes. I'll reconcile after the gateway is live." }],
  },

  /* -------------------------------- Risks ------------------------------ */
  {
    id: "clm_risk_email_owner",
    type: "RISK",
    section: "Risks",
    title: "email-templates has a single maintainer: Meera",
    statement:
      "All 23 commits to services/email-templates are by Meera, and others route template changes through her. No document names a second maintainer.",
    topicKey: "email_templates_owner",
    owner: "meera",
    date: "2026-04-21",
    grade: "INFERRED",
    gradeReason: "Inferred from commit history (23 of 23 commits by Meera); no record states ownership",
    isInference: true,
    evidence: [
      { source: "src_commits", quote: "feat(email-templates): scaffold MJML build with handlebars partials" },
      { source: "src_commits", quote: "fix(email-templates): reminder job sent twice when a deploy overlapped the cron" },
      { source: "src_chat_dev", quote: "send me the colours, I'll push it. The template build needs bash." },
    ],
  },
  {
    id: "clm_risk_db_expiry",
    type: "RISK",
    section: "Risks",
    title: "Production Postgres (free plan) expires 27 Apr, 3 days before the fest",
    statement:
      "Render's free database expires on 27 April and is deleted 14 days later unless upgraded. The fest starts 30 April and the upgrade is not done.",
    topicKey: "db_expiry",
    date: "2026-04-27",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: PR #41 comment (merged), Issue #61, #dev 15-Apr",
    evidence: [
      { source: "src_pr_41", quote: "Yes, ours expires on 27 April. We need to move to a paid plan before the fest." },
      { source: "src_issue_61", quote: "the free database instance expires on 2026-04-27 and will be deleted 14 days later unless upgraded" },
      { source: "src_chat_dev", quote: "we need the paid Postgres plan anyway, the free one expires on 27 April." },
    ],
  },
  {
    id: "clm_risk_hmac_secret",
    type: "RISK",
    section: "Risks",
    title: "Ticket signing secret ships inside the scanner PWA",
    statement:
      "Offline verification means TICKET_SIGNING_SECRET is bundled into the scanner; anyone who extracts it can mint valid tickets. Accepted for 2026; Ed25519 planned next year.",
    topicKey: "ticket_signing_risk",
    owner: "meera",
    date: "2026-03-06",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: PR #66 comment (merged), #dev 06-Mar, Trello FF-116",
    evidence: [
      { source: "src_pr_66", quote: "The scanner will need TICKET_SIGNING_SECRET in its bundle to verify offline." },
      { source: "src_chat_dev", quote: "anyone who extracts it from the PWA can mint tickets" },
      { source: "src_trello", quote: "The HMAC secret currently ships in the PWA bundle." },
    ],
  },
  {
    id: "clm_risk_leaked_key",
    type: "RISK",
    section: "Access & secrets",
    title: "Internal API key pasted in Discord on 6 Mar, not rotated",
    statement:
      "The admin-desk API key was pasted in #dev on 6 Mar. The message was deleted but the key was never rotated; the Trello card was due 10 Apr.",
    topicKey: "leaked_key",
    owner: "meera",
    date: "2026-03-06",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: #dev 06-Mar, Issue #74, Trello FF-107",
    evidence: [
      { source: "src_chat_dev", quote: "please don't paste keys in Discord. Deleting this, I'll rotate it." },
      { source: "src_issue_74", quote: "Message deleted, but the key must be rotated in the Render env and the admin desk." },
      { source: "src_trello", quote: "Pasted in #dev on 6 Mar. Not rotated yet." },
    ],
  },
  {
    id: "clm_risk_load",
    type: "RISK",
    section: "Risks",
    title: "Registration API missed the 300 rps target on the free DB",
    statement:
      "First load test: p95 2.8s at 300 rps with DB CPU at 95%. An index brought p95 to 640ms; not yet tested on the paid plan.",
    topicKey: "load_capacity",
    owner: "kabir",
    date: "2026-04-15",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: #dev 15-Apr, Issue #35",
    evidence: [
      { source: "src_chat_dev", quote: "300 rps on registration: p95 2.8s, DB CPU at 95% on the Render free instance. Not good." },
      { source: "src_issue_35", quote: "After adding the registrations(event_id, status) index: p95 640ms at 300 rps." },
    ],
  },
  {
    id: "clm_risk_no_payments",
    type: "RISK",
    section: "Risks",
    title: "No live payment gateway a week before registrations close",
    statement: "Razorpay live keys are blocked on KYC and PhonePe is only on trial. If KYC does not clear by 25 April, online payments cannot be taken.",
    topicKey: "payments_live",
    date: "2026-04-17",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #payments (17-Apr, 23-Apr)",
    evidence: [
      { source: "src_chat_payments", quote: "If KYC isn't done by 25 April we can't take payments at all. Need a backup." },
      { source: "src_chat_payments", quote: "Still no word from Razorpay. Meeting Prof. Rao tomorrow." },
    ],
  },
  {
    id: "clm_risk_domain",
    type: "RISK",
    section: "Risks",
    title: "festflow.dev appears to renew on Meera's personal card",
    statement: "The domain renewal reminder goes to Meera and the Trello card says it renews on a personal card in June. After she leaves, renewal could lapse.",
    topicKey: "domain_renewal",
    owner: "meera",
    date: "2026-06-10",
    grade: "INFERRED",
    gradeReason: "Inferred: #dev 21-Apr (reminder goes to Meera) + Trello FF-126 (personal card); no record names the card holder",
    isInference: true,
    evidence: [
      { source: "src_chat_dev", quote: "domain renewal reminder for festflow.dev came to me again, it renews in June" },
      { source: "src_trello", quote: "Renews on a personal card. Move it to the club account." },
    ],
  },
  {
    id: "clm_risk_double_admit",
    type: "RISK",
    section: "Risks",
    title: "Offline scanners can admit the same ticket twice",
    statement: "Two phones that are both offline will each accept the same ticket; the server only flags the second check-in after sync.",
    topicKey: "double_admit",
    owner: "kabir",
    date: "2026-03-02",
    grade: "INFERRED",
    gradeReason: "Inferred from PR #58 review discussion; no record treats it as a risk",
    isInference: true,
    evidence: [{ source: "src_pr_58", quote: "Both accept it. The server keeps the first check-in and flags the second one in the admin desk." }],
  },
  {
    id: "clm_risk_dev_env",
    type: "RISK",
    section: "Access & secrets",
    title: "Only Meera has the dev .env values",
    statement: "README tells contributors to ask Meera for the dev environment values; no shared vault is mentioned anywhere.",
    topicKey: "dev_env_values",
    owner: "meera",
    date: "2026-01-05",
    grade: "INFERRED",
    gradeReason: "Inferred from README.md; no record of a shared secrets store",
    isInference: true,
    evidence: [{ source: "src_doc_readme", quote: "ask Meera for the dev values" }],
  },
  {
    id: "clm_risk_backups",
    type: "RISK",
    section: "Risks",
    title: "No evidence of database backups",
    statement: "Single production environment on a free Postgres plan with no staging; no record mentions backups or restore drills.",
    topicKey: "db_backups",
    date: "2026-04-15",
    grade: "INFERRED",
    gradeReason: "Inferred from absence: architecture.md + Issue #61; no record of backups",
    isInference: true,
    status: "REJECTED",
    reviewerNote: "Not a separate risk: the paid Render plan includes daily backups. Tracked under the DB upgrade task.",
    evidence: [
      { source: "src_doc_architecture", quote: "There is a single production environment and no staging." },
      { source: "src_issue_61", quote: "will be deleted 14 days later unless upgraded" },
    ],
  },

  /* ---------------------------- Dependencies --------------------------- */
  {
    id: "clm_dep_supabase",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "Supabase Auth (magic link + Google, free tier 50k MAU)",
    statement: "Participant login depends on Supabase Auth; the API verifies Supabase JWTs with SUPABASE_JWT_SECRET.",
    topicKey: "vendor_supabase",
    date: "2026-03-12",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: PR #84 (merged), #dev 10-Mar",
    evidence: [
      { source: "src_pr_84", quote: "Supabase Auth (magic link + Google) replaces Firebase Authentication" },
      { source: "src_chat_dev", quote: "Magic link + Google, the free tier gives 50k MAU." },
    ],
  },
  {
    id: "clm_dep_render",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "Render hosts web, API, Postgres and the reminder cron",
    statement: "Two Render web services (festflow-web, festflow-api), a Postgres instance, and a daily 9am IST cron for reminder emails.",
    topicKey: "vendor_render",
    date: "2026-04-17",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: PR #41 (merged), #dev 17-Apr",
    evidence: [
      { source: "src_pr_41", quote: "with two web services (`festflow-web`, `festflow-api`) and a Postgres instance on the free plan" },
      { source: "src_chat_dev", quote: "reminder job runs as a Render cron at 9am IST daily" },
    ],
  },
  {
    id: "clm_dep_resend",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "Resend sends all email (free tier: 3,000/month)",
    statement: "Resend API key is in the Render env as RESEND_API_KEY; the plan must be upgraded if volume goes above 3,000 emails a month.",
    topicKey: "vendor_resend",
    date: "2026-02-06",
    grade: "VERIFIED",
    gradeReason: "Authoritative source: PR #29 (merged)",
    evidence: [{ source: "src_pr_29", quote: "The free tier covers 3,000 emails a month; we upgrade if registrations go above that." }],
  },
  {
    id: "clm_dep_cloudflare",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "Cloudflare DNS for festflow.dev (SPF/DKIM, Render records)",
    statement: "DNS for festflow.dev and api.festflow.dev is on Cloudflare, including the SPF and DKIM records Resend needs.",
    topicKey: "vendor_cloudflare",
    date: "2026-02-14",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: PR #29 comment, PR #41 (both merged)",
    evidence: [
      { source: "src_pr_29", quote: "festflow.dev has the SPF and DKIM records in Cloudflare now." },
      { source: "src_pr_41", quote: "DNS for festflow.dev and api.festflow.dev now points to Render (Cloudflare)." },
    ],
  },
  {
    id: "clm_dep_bank",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "All fees go to the club account at the SBI campus branch",
    statement: "Payments must settle into the club's SBI campus-branch account; personal UPI collections are not allowed.",
    topicKey: "club_bank",
    owner: "dev",
    date: "2026-01-28",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #payments 28-Jan",
    evidence: [{ source: "src_chat_payments", quote: "all fees go to the club account at the SBI campus branch, no personal UPI collections" }],
  },
  {
    id: "clm_dep_local_run",
    type: "DEPENDENCY",
    section: "Run & deploy",
    title: "Local dev: Node 20+, dev .env from Meera, WSL on Windows",
    statement: "npm install, copy .env.example and fill dev values, then npm run dev (web :3000, api :4000). Native Windows builds are not supported.",
    topicKey: "local_run",
    date: "2026-01-05",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: README.md",
    evidence: [{ source: "src_doc_readme", quote: "Requires Node 20+. On Windows use WSL; native Windows builds are not supported yet." }],
  },
  {
    id: "clm_sponsor_tranche",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "Title sponsor's second tranche (₹75,000) is due after the fest",
    statement: "Zenith Motors committed ₹1,50,000; ₹75,000 is received and the rest is due after the fest.",
    topicKey: "sponsor_tranche",
    owner: "dev",
    date: "2026-02-18",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: budget sheet row 2 (restricted)",
    evidence: [{ source: "src_budget", quote: "Committed (INR): 150000 · Received (INR): 75000" }],
  },

  /* ------------------------------ Contacts ----------------------------- */
  {
    id: "clm_contact_rao",
    type: "CONTACT",
    section: "Contacts",
    title: "Prof. S. Rao approves committee decisions and the handover",
    statement: "Faculty coordinator. Approves meeting notes and gateway/spend decisions, and gets the club certificate for KYC.",
    topicKey: "contact_rao",
    owner: "rao",
    date: "2026-04-03",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: notes 02-Apr (approved), #payments 21-Apr",
    status: "EDITED",
    reviewerNote: "Also signs off any tech spend above ₹2,000.",
    evidence: [
      { source: "src_notes_0402", quote: "Status: approved by Prof. S. Rao on 3 Apr 2026" },
      { source: "src_chat_payments", quote: "Someone has to make the call with Prof. Rao." },
    ],
  },
  {
    id: "clm_contact_dev",
    type: "CONTACT",
    section: "Contacts",
    title: "Dev Patil (treasurer): budget, KYC and spend approvals",
    statement: "Treasurer. Holds the budget sheet with Prof. Rao, runs payment gateway KYC and approves paid plans.",
    topicKey: "contact_dev",
    owner: "dev",
    date: "2026-04-02",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: #general 08-Jan, notes 02-Apr (approved)",
    evidence: [
      { source: "src_chat_general", quote: "Treasurer here. The budget sheet is with Prof. Rao and me" },
      { source: "src_notes_0402", quote: "Dev to complete KYC with the club's bank account." },
    ],
  },
  {
    id: "clm_contact_sana",
    type: "CONTACT",
    section: "Contacts",
    title: "Sana Iyer holds the design files and sponsor logos",
    statement: "Design lead. Ticket, email and sponsor-logo designs live in her Figma files.",
    topicKey: "contact_sana",
    owner: "sana",
    date: "2026-04-02",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: notes 02-Apr (approved), Issue #27",
    evidence: [
      { source: "src_notes_0402", quote: "Sponsor logo strip on the ticket email and the site footer. Sana has the files." },
      { source: "src_issue_27", quote: "Logo files are in the Figma file under 'Sponsors 2026'." },
    ],
  },
  {
    id: "clm_contact_kabir",
    type: "CONTACT",
    section: "Contacts",
    title: "Kabir Shah is the de facto owner of the scanner PWA",
    statement: "Kabir wrote the scanner shell, offline queue and sync indicator, and gate volunteers register with him.",
    topicKey: "scanner_owner",
    owner: "kabir",
    date: "2026-04-12",
    grade: "INFERRED",
    gradeReason: "Inferred from commits and #general 12-Apr; no record names a scanner owner",
    isInference: true,
    evidence: [
      { source: "src_commits", quote: "feat(scanner): offline check-in queue in IndexedDB (#58)" },
      { source: "src_chat_general", quote: "volunteers for gate check-in, register with Kabir by 20 April" },
    ],
  },
  {
    id: "clm_contact_arjun",
    type: "CONTACT",
    section: "Contacts",
    title: "Arjun Mehta takes over as tech lead from May",
    statement: "Arjun succeeds Meera as FestFlow tech lead when she graduates in May.",
    topicKey: "successor",
    owner: "arjun",
    date: "2026-04-21",
    grade: "VERIFIED",
    gradeReason: "2 independent sources: notes 14-Mar (approved), #general 21-Apr",
    evidence: [
      { source: "src_notes_0314", quote: "Arjun takes over as tech lead." },
      { source: "src_chat_general", quote: "Arjun Mehta takes over as tech lead from May." },
    ],
  },
  {
    id: "clm_contact_sponsor_feb",
    type: "CONTACT",
    section: "Contacts",
    title: "Title sponsor contact on record: Zenith Motors marketing (Feb)",
    statement: "The budget sheet lists Ritika Sharma (Marketing) at Zenith Motors Pune as the title-sponsor contact, last updated 18 Feb.",
    topicKey: "sponsor_contact",
    date: "2026-02-18",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: budget sheet row 2 (restricted, last updated 18-Feb)",
    evidence: [{ source: "src_budget", quote: "Contact: Ritika Sharma (Marketing)" }],
  },

  /* -------------------------- Recurring problems ------------------------ */
  {
    id: "clm_rec_windows",
    type: "RECURRING",
    section: "Recurring problems",
    title: "Build fails on Windows (7 reports since January)",
    statement:
      "services/email-templates runs a bash script (copy-templates.sh), so npm run build fails on native Windows. Reported 7 times across Issues #31, #47, #63 and #dev. Workaround: WSL. The shx fix (PR #97) was closed because it broke macOS.",
    topicKey: "windows_build",
    date: "2026-04-10",
    grade: "VERIFIED",
    gradeReason: "5 independent sources: Issues #31, #47, #63, #dev (4 reports), PR #97",
    evidence: [
      { source: "src_issue_31", quote: "Build fails on Windows: copy-templates.sh is not recognized" },
      { source: "src_issue_47", quote: "Build fails on Windows (again) after pulling main" },
      { source: "src_issue_63", quote: "Build fails on Windows for me too." },
      { source: "src_chat_dev", quote: "Build fails on Windows for me: 'copy-templates.sh' is not recognized." },
      { source: "src_chat_dev", quote: "Build fails on Windows with 'bash' is not recognized" },
      { source: "src_pr_97", quote: "This breaks the build on macOS" },
    ],
  },
  {
    id: "clm_rec_double_pay",
    type: "RECURRING",
    section: "Recurring problems",
    title: "Double registrations from double-clicking Pay (fixed 16 Apr)",
    statement: "Double-clicking Pay created duplicate orders and registrations; several users paid twice. Fixed with an idempotency key on payment create.",
    topicKey: "double_pay",
    owner: "meera",
    date: "2026-04-16",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: Issue #44, #general 25-Mar, #dev 16-Apr",
    evidence: [
      { source: "src_issue_44", quote: "double-clicking Pay creates two orders and two registrations" },
      { source: "src_chat_general", quote: "I paid twice for Battle of Bands, what do I do?" },
      { source: "src_chat_dev", quote: "idempotency key on payment create is merged, no more double registrations" },
    ],
  },
  {
    id: "clm_rec_firebase_quota",
    type: "RECURRING",
    section: "Recurring problems",
    title: "Firebase email-link quota ran out repeatedly (resolved by Supabase)",
    statement: "Sign-in emails stopped on 9 and 11 Mar when the Firebase free-tier quota ran out; this triggered the move to Supabase.",
    topicKey: "firebase_quota",
    date: "2026-03-11",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: Issue #14, #general 09-Mar, #dev 09-Mar",
    evidence: [
      { source: "src_issue_14", quote: "Happened again today. Working on moving auth off Firebase." },
      { source: "src_chat_general", quote: "a lot of people say they never got the login email" },
      { source: "src_chat_dev", quote: "we've hit the daily quota on the free tier. Sign-ups are piling up." },
    ],
  },
  {
    id: "clm_rec_wifi",
    type: "RECURRING",
    section: "Recurring problems",
    title: "Hostel and auditorium Wi-Fi is unreliable",
    statement: "Slow or dropped connections on campus Wi-Fi recur; the scanner was designed offline-first because of it.",
    topicKey: "campus_wifi",
    date: "2026-03-01",
    grade: "VERIFIED",
    gradeReason: "3 independent sources: architecture.md, PR #58 (merged), #general 01-Mar",
    evidence: [
      { source: "src_doc_architecture", quote: "Hostel and auditorium Wi-Fi is unreliable" },
      { source: "src_pr_58", quote: "Volunteers' phones will lose Wi-Fi inside the auditorium." },
      { source: "src_chat_general", quote: "site is super slow from hostel wifi, is it just me?" },
    ],
  },

  /* ------------------------------ Questions ---------------------------- */
  {
    id: "clm_q_oncall",
    type: "QUESTION",
    section: "Open work",
    title: "Who is on call during the fest (30 Apr – 2 May)?",
    statement: "The on-call rota for fest days is an open Trello card with no members.",
    topicKey: "oncall",
    date: "2026-04-21",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: Trello FF-125",
    evidence: [{ source: "src_trello", quote: "Who is on call 30 Apr to 2 May? Not decided." }],
  },
  {
    id: "clm_q_accounts",
    type: "QUESTION",
    section: "Access & secrets",
    title: "Where are the Render, Supabase, Resend and Cloudflare accounts?",
    statement: "Arjun asked Meera to write down where all service accounts live; she agreed to add it to the handover.",
    topicKey: "accounts_list",
    owner: "arjun",
    date: "2026-04-22",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #dev 22-Apr",
    evidence: [{ source: "src_chat_dev", quote: "can you also write down where all the accounts are? Render, Supabase, Resend, Cloudflare" }],
  },
  {
    id: "clm_q_db_password",
    type: "QUESTION",
    section: "Access & secrets",
    title: "Arjun asked where the prod DB password is; the answer went to DM",
    statement: "On 19 Apr Arjun needed the production database password to run a migration. Meera replied she would DM it; nothing is recorded.",
    topicKey: "db_password_ask",
    owner: "arjun",
    date: "2026-04-19",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #dev 19-Apr",
    evidence: [
      { source: "src_chat_dev", quote: "where is the prod database password? I need to run a migration" },
      { source: "src_chat_dev", quote: "will DM you tonight" },
    ],
  },
  {
    id: "clm_q_load_rerun",
    type: "QUESTION",
    section: "Open work",
    title: "Does the load test need a re-run after the paid DB upgrade?",
    statement: "Kabir asked whether to re-run the load test after the upgrade; Arjun said yes, once Dev approves the spend.",
    topicKey: "load_rerun",
    owner: "kabir",
    date: "2026-04-23",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: #dev 23-Apr",
    evidence: [{ source: "src_chat_dev", quote: "should I run the load test again after the paid DB upgrade?" }],
  },

  /* ------------------------------- Missing ----------------------------- */
  {
    id: "clm_gap_db_password",
    type: "RISK",
    section: "Access & secrets",
    title: "No record of who holds the production database password",
    statement: "Checklist item 'credentials & secrets owner' is unmet: no source says who holds the production database password or where it is stored apart from the host env.",
    topicKey: "gap:credentials_owner",
    grade: "MISSING",
    gradeReason: "Checklist: credentials & secrets owner. 0 records; architecture.md only says it is an env var on the host",
    evidence: [],
  },
  {
    id: "clm_gap_prod_accounts",
    type: "RISK",
    section: "Access & secrets",
    title: "No record of who owns the Render, Supabase, Resend and Cloudflare accounts",
    statement: "Checklist item 'production accounts/access' is unmet: no source lists account owners, admins or recovery emails.",
    topicKey: "gap:production_access",
    grade: "MISSING",
    gradeReason: "Checklist: production accounts/access. 0 records",
    evidence: [],
  },
  {
    id: "clm_gap_sponsor_contact",
    type: "CONTACT",
    section: "Contacts",
    title: "Current sponsor point of contact is unknown",
    statement: "Checklist item 'key contacts' is partly unmet: no record after February names who now handles sponsors.",
    topicKey: "gap:sponsor_contact",
    grade: "MISSING",
    gradeReason: "Checklist: key contacts. No record after 18-Feb",
    evidence: [],
  },
  {
    id: "clm_gap_payment_account",
    type: "DEPENDENCY",
    section: "Vendors & dependencies",
    title: "No record of who owns the payment gateway merchant login",
    statement: "Neither the Razorpay nor the PhonePe merchant account owner, login email or 2FA holder is recorded.",
    topicKey: "gap:payment_account",
    grade: "MISSING",
    gradeReason: "Checklist: credentials & secrets owner (payments). 0 records",
    evidence: [],
  },
  {
    id: "clm_gap_reviewer",
    type: "CONTACT",
    section: "Review & approval",
    title: "No reviewer named for PRs after Meera leaves",
    statement: "Every PR currently needs Meera's approval, and no record says who approves changes after she graduates.",
    topicKey: "gap:review_approval",
    grade: "MISSING",
    gradeReason: "Checklist: who reviews/approves changes. Only Meera is named",
    evidence: [],
  },
  {
    id: "clm_gap_registrar",
    type: "DEPENDENCY",
    section: "Access & secrets",
    title: "No record of the domain registrar login for festflow.dev",
    statement: "DNS is on Cloudflare, but the registrar account and its login for festflow.dev are not recorded anywhere.",
    topicKey: "gap:domain_registrar",
    grade: "MISSING",
    gradeReason: "Checklist: production accounts/access (domain). 0 records",
    evidence: [],
  },
];

/* --------------------------------------------------------------------------- */
/* Testimony (answered gap questions). Each creates a TESTIMONY source + chunk.  */
/* --------------------------------------------------------------------------- */

export type GapSpec = {
  id: string;
  kind: GapKind;
  question: string;
  rationale: string;
  priority: number;
  relatedClaim?: string;
  checklistKey?: string;
  answer?: { text: string; at: string };
};

export const GAP_QUESTIONS: GapSpec[] = [
  {
    id: "gq_payment",
    kind: "CONFLICT",
    question: "Which payment gateway goes live: Razorpay (approved notes, 2 Apr) or PhonePe (trial since 19 Apr)?",
    rationale:
      "Approved notes say \"Final: go with Razorpay\", but #payments and draft PR #93 show a PhonePe trial. 6 claims depend on it: KYC, refunds, webhook, cash reconciliation, the live-payments risk and the bank account.",
    priority: 54,
    relatedClaim: "clm_payment_razorpay",
    checklistKey: "key_decisions",
  },
  {
    id: "gq_db_password",
    kind: "MISSING",
    question: "Who holds the production database password, and how should Arjun get it after you leave?",
    rationale:
      "Checklist: credentials & secrets owner. architecture.md only says it is an env var on the host, and when Arjun asked on 19-Apr the answer went to DM. 6 claims depend on database access: the DB upgrade, load re-test, expiry risk, migrations, backups and accounts.",
    priority: 48,
    relatedClaim: "clm_gap_db_password",
    checklistKey: "credentials_owner",
  },
  {
    id: "gq_regclose",
    kind: "CONFLICT",
    question: "Do registrations close on 25 April (14-Mar notes, site countdown) or 28 April (#general announcement)?",
    rationale:
      "The approved notes and REGISTRATION_CLOSES_AT say 25 Apr; the treasurer told everyone 28 Apr. Participants are already asking. 5 dependent claims: countdown, payments-live risk, cash reconciliation, load test and the feature freeze.",
    priority: 35,
    relatedClaim: "clm_regclose_25",
    checklistKey: "upcoming_deadlines",
  },
  {
    id: "gq_accounts",
    kind: "MISSING",
    question: "Which service accounts (Render, Supabase, Resend, Cloudflare) are on your personal email, and who should own them now?",
    rationale:
      "Checklist: production accounts/access. Arjun asked for this on 22-Apr; no record lists owners or recovery emails. 4 vendors depend on it.",
    priority: 32,
    relatedClaim: "clm_gap_prod_accounts",
    checklistKey: "production_access",
  },
  {
    id: "gq_deploy",
    kind: "MISSING",
    question: "How do you deploy to production, and how do you roll back a bad deploy?",
    rationale:
      "Checklist: how to run/deploy. README covers local dev only; no record describes production deploys or rollback. The reminder cron and the API deploy together, which already caused duplicate emails once.",
    priority: 30,
    relatedClaim: "clm_t_deploy",
    checklistKey: "run_deploy",
    answer: {
      at: "2026-04-23T21:10:00+05:30",
      text:
        "Every push to main auto-deploys both services on Render, no manual step. To roll back, open the service in the Render dashboard, go to Events, pick the last good deploy and click Rollback. Database migrations are not rolled back by Render: run prisma migrate from your laptop against prod, carefully, and take a manual backup first. The reminder cron deploys with the api service, so avoid deploying around 9am IST.",
    },
  },
  {
    id: "gq_email_owner",
    kind: "SINGLE_OWNER",
    question: "Who else can build and change services/email-templates? All 23 commits there are yours.",
    rationale:
      "Inferred single owner: 23 of 23 commits by Meera, and template changes are routed to her. Reminder emails, tickets and refunds all depend on this package.",
    priority: 28,
    relatedClaim: "clm_risk_email_owner",
    checklistKey: "open_work",
  },
  {
    id: "gq_refund",
    kind: "CONFLICT",
    question: "Is the refund cutoff 15 April (architecture.md, PR #95 default) or 20 April (Trello, #general)?",
    rationale:
      "Two written policies disagree, and the treasurer has already told participants 20 April. PR #95 ships whichever default is chosen.",
    priority: 24,
    relatedClaim: "clm_refund_15",
    checklistKey: "key_decisions",
  },
  {
    id: "gq_sponsor",
    kind: "MISSING",
    question: "Who is the current point of contact for our sponsors, and how should Arjun reach them?",
    rationale:
      "Checklist: key contacts. No record after February names who handles sponsors, and the second sponsor payment is due after the fest.",
    priority: 21,
    relatedClaim: "clm_gap_sponsor_contact",
    checklistKey: "key_contacts",
  },
  {
    id: "gq_windows",
    kind: "RECURRING",
    question: "\"Build fails on Windows\" has been reported 7 times. What is the real fix, and what should new volunteers do today?",
    rationale:
      "Recurring: Issues #31, #47, #63 and 4 reports in #dev. The only documented workaround is WSL, and the shx attempt (PR #97) broke macOS.",
    priority: 18,
    relatedClaim: "clm_t_windows_fix",
    checklistKey: "recurring_problems",
    answer: {
      at: "2026-04-23T21:25:00+05:30",
      text:
        "Use WSL for now, it works for everyone. The real fix is to replace scripts/copy-templates.sh with a small Node script using fs.cpSync, not shx, which is what broke macOS. It's maybe an hour of work; I never got to it.",
    },
  },
  {
    id: "gq_domain",
    kind: "INFERRED",
    question: "festflow.dev seems to renew on your personal card in June. Is that right, and who should own the domain after you leave?",
    rationale:
      "Inferred: the renewal reminder goes to Meera and Trello says it renews on a personal card. If it lapses, the site, API and email (SPF/DKIM) all go down.",
    priority: 12,
    relatedClaim: "clm_risk_domain",
    checklistKey: "production_access",
  },
];

/** Claims created from answered gap questions (evidence = the testimony chunk). */
export const TESTIMONY_CLAIMS: (ClaimSpec & { gap: string })[] = [
  {
    gap: "gq_deploy",
    id: "clm_t_deploy",
    type: "DECISION",
    section: "Run & deploy",
    title: "Deploy: every push to main auto-deploys on Render; roll back from the dashboard",
    statement:
      "Pushing to main deploys both services. Roll back via Render dashboard → Events → last good deploy → Rollback. Migrations are not rolled back: back up first and run prisma migrate manually. Avoid deploying around the 9am IST cron.",
    topicKey: "deploy_process",
    owner: "meera",
    date: "2026-04-23",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: testimony from Meera Kulkarni (exit interview, 23-Apr)",
    fromTestimony: true,
    evidence: [
      { source: "src_testimony_gq_deploy", quote: "Every push to main auto-deploys both services on Render, no manual step." },
      { source: "src_testimony_gq_deploy", quote: "Database migrations are not rolled back by Render" },
    ],
  },
  {
    gap: "gq_windows",
    id: "clm_t_windows_fix",
    type: "RECURRING",
    section: "Recurring problems",
    title: "Windows build fix: replace copy-templates.sh with a Node script",
    statement: "Workaround today is WSL. The real fix is a small Node script using fs.cpSync instead of the bash script (not shx), about an hour of work.",
    topicKey: "windows_build_fix",
    owner: "meera",
    date: "2026-04-23",
    grade: "SINGLE_SOURCE",
    gradeReason: "1 source: testimony from Meera Kulkarni (exit interview, 23-Apr)",
    fromTestimony: true,
    evidence: [
      { source: "src_testimony_gq_windows", quote: "replace scripts/copy-templates.sh with a small Node script using fs.cpSync" },
    ],
  },
];

/* -------------------------------- Conflicts -------------------------------- */

export type ConflictSpec = {
  id: string;
  topicKey: string;
  a: string;
  b: string;
  kind: ConflictKind;
  status: ConflictStatus;
  resolution?: Resolution;
  note?: string;
};

export const CONFLICTS: ConflictSpec[] = [
  { id: "cf_payment", topicKey: "payment_gateway", a: "clm_payment_razorpay", b: "clm_payment_phonepe", kind: "CONTRADICTS", status: "OPEN", note: "Approved decision (2 Apr) vs a live trial started 17 days later." },
  { id: "cf_regclose", topicKey: "registration_close", a: "clm_regclose_25", b: "clm_regclose_28", kind: "CONTRADICTS", status: "OPEN", note: "The site countdown and the public announcement disagree by 3 days." },
  { id: "cf_refund", topicKey: "refund_cutoff", a: "clm_refund_15", b: "clm_refund_20", kind: "CONTRADICTS", status: "OPEN", note: "Two written policies; participants were told 20 April." },
  { id: "cf_auth", topicKey: "auth_provider", a: "clm_auth_firebase", b: "clm_auth_supabase", kind: "SUPERSEDES", status: "RESOLVED", resolution: "B", note: "Supabase replaced Firebase on 12 Mar (PR #84)." },
  { id: "cf_hosting", topicKey: "hosting", a: "clm_hosting_vercel", b: "clm_hosting_render", kind: "SUPERSEDES", status: "RESOLVED", resolution: "B", note: "Render replaced Vercel on 14 Feb (PR #41)." },
  { id: "cf_email", topicKey: "email_provider", a: "clm_email_gmail", b: "clm_email_resend", kind: "SUPERSEDES", status: "RESOLVED", resolution: "B", note: "Resend replaced Gmail SMTP on 6 Feb (PR #29)." },
];

/* ------------------------------- Audit trail ------------------------------- */

export const AUDIT: {
  at: string;
  actor: PersonKey | "system";
  role: string;
  action: string;
  targetType: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}[] = [
  { at: "2026-04-22T18:02:00+05:30", actor: "meera", role: "OWNER", action: "project.create", targetType: "Project", targetId: "festflow" },
  { at: "2026-04-22T18:05:00+05:30", actor: "meera", role: "OWNER", action: "source.connect", targetType: "Source", targetId: "src_commits", meta: { via: "github", repo: "festflow-club/festflow", items: 87 } },
  { at: "2026-04-22T18:06:00+05:30", actor: "meera", role: "OWNER", action: "source.connect", targetType: "Source", targetId: "src_chat_dev", meta: { via: "upload", file: "discord-export.json", channels: 3 } },
  { at: "2026-04-22T18:07:00+05:30", actor: "meera", role: "OWNER", action: "source.connect", targetType: "Source", targetId: "src_doc_architecture", meta: { via: "upload", files: 5 } },
  { at: "2026-04-22T18:08:00+05:30", actor: "meera", role: "OWNER", action: "source.label", targetType: "Source", targetId: "src_budget", meta: { access: "RESTRICTED", grantedToIncoming: false } },
  { at: "2026-04-22T18:09:00+05:30", actor: "meera", role: "OWNER", action: "pipeline.run", targetType: "PipelineRun", targetId: "run_seed", meta: { mode: "CACHED" } },
  { at: "2026-04-23T21:10:00+05:30", actor: "meera", role: "OWNER", action: "interview.answer", targetType: "GapQuestion", targetId: "gq_deploy" },
  { at: "2026-04-23T21:25:00+05:30", actor: "meera", role: "OWNER", action: "interview.answer", targetType: "GapQuestion", targetId: "gq_windows" },
  { at: "2026-04-23T21:40:00+05:30", actor: "meera", role: "OWNER", action: "handover.submit", targetType: "Handover", targetId: "ho_festflow", meta: { status: "IN_REVIEW" } },
  { at: "2026-04-24T10:15:00+05:30", actor: "rao", role: "REVIEWER", action: "claim.edit", targetType: "Claim", targetId: "clm_contact_rao", meta: { field: "reviewerNote" } },
  { at: "2026-04-24T10:22:00+05:30", actor: "rao", role: "REVIEWER", action: "claim.edit", targetType: "Claim", targetId: "clm_task_db_upgrade", meta: { field: "reviewerNote" } },
  { at: "2026-04-24T10:31:00+05:30", actor: "rao", role: "REVIEWER", action: "claim.reject", targetType: "Claim", targetId: "clm_risk_backups" },
];
