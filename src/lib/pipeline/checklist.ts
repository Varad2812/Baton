// The 12-item handover checklist and the matching handover sections.

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

export type Section = (typeof SECTIONS)[number];

export type ChecklistItem = {
  key: string;
  label: string;
  section: Section;
  /** Risk weight used for gap-question priority (higher = more dangerous if unknown). */
  weight: number;
  /** What a claim must state to satisfy this item (fed to the model). */
  satisfiedBy: string;
};

export const CHECKLIST: ChecklistItem[] = [
  { key: "purpose_status", label: "Purpose & current status", section: "Purpose & status", weight: 3, satisfiedBy: "what the project is for and where it stands now" },
  { key: "run_deploy", label: "How to run / deploy", section: "Run & deploy", weight: 5, satisfiedBy: "how to run it locally AND how production is deployed or rolled back" },
  { key: "code_docs", label: "Where code / docs live", section: "Code & docs", weight: 2, satisfiedBy: "where the repository, docs or design files live" },
  { key: "credentials_owner", label: "Credentials & secrets owner", section: "Access & secrets", weight: 8, satisfiedBy: "WHO holds a named production credential or secret, or where it is stored" },
  { key: "production_access", label: "Production accounts / access", section: "Access & secrets", weight: 7, satisfiedBy: "WHO owns or administers a named production account (hosting, DB, email, domain)" },
  { key: "open_work", label: "Open work with owners", section: "Open work", weight: 4, satisfiedBy: "an unfinished task together with its owner" },
  { key: "key_decisions", label: "Key decisions (last 90 days)", section: "Decisions", weight: 5, satisfiedBy: "a decision that was made, ideally with date and reason" },
  { key: "external_dependencies", label: "External dependencies / vendors", section: "Vendors & dependencies", weight: 4, satisfiedBy: "a third-party service, vendor or library the project depends on" },
  { key: "key_contacts", label: "Key contacts", section: "Contacts", weight: 4, satisfiedBy: "a named person to contact for a named area (internal or external)" },
  { key: "recurring_problems", label: "Recurring problems & fixes", section: "Recurring problems", weight: 3, satisfiedBy: "a problem that happened more than once, and its fix or workaround" },
  { key: "upcoming_deadlines", label: "Upcoming deadlines", section: "Deadlines", weight: 5, satisfiedBy: "a dated deadline or milestone in the future" },
  { key: "review_approval", label: "Who reviews / approves changes", section: "Review & approval", weight: 5, satisfiedBy: "who reviews or approves changes, and the rule" },
];

export const CHECKLIST_KEYS = CHECKLIST.map((c) => c.key) as [string, ...string[]];

export const checklistItem = (key: string | null | undefined): ChecklistItem | undefined =>
  CHECKLIST.find((c) => c.key === key);

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}
