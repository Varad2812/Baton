/**
 * Shared by the /new wizard (client) and src/app/_actions/new-project.ts (server).
 * Pure: no React, no Prisma, so both sides validate with exactly the same rules.
 */
import { z } from "zod";

export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EXT = ["md", "txt", "csv", "json", "docx", "pdf", "zip"] as const;
export const ACCESS = ["PUBLIC", "TEAM", "RESTRICTED"] as const;
export type AccessLevel = (typeof ACCESS)[number];

/** Slugs that already exist or would shadow app routes. */
export const RESERVED_SLUGS = ["festflow", "new", "api", "p", "styleguide", "admin"];

export const SlugSchema = z
  .string()
  .min(3, "At least 3 characters")
  .max(40, "At most 40 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens")
  .refine((s) => !RESERVED_SLUGS.includes(s) && !/^festflow-[0-9a-f]{10}$/.test(s), "This slug is taken (festflow is the demo project)");

export const ProjectSchema = z.object({
  name: z.string().trim().min(2, "Give the project a name").max(60, "At most 60 characters"),
  slug: SlugSchema,
  description: z.string().trim().min(8, "One line, at least 8 characters").max(140, "At most 140 characters"),
});

const PersonSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  roleTitle: z.string().trim().min(2, "Role title is required").max(60),
});

export const PeopleSchema = z
  .object({ departing: PersonSchema, incoming: PersonSchema, reviewer: PersonSchema })
  .superRefine((p, ctx) => {
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    if (p.departing.name && same(p.departing.name, p.reviewer.name))
      ctx.addIssue({ code: "custom", path: ["reviewer", "name"], message: "Must differ from the departing person (no self-approval)" });
    if (p.departing.name && same(p.departing.name, p.incoming.name))
      ctx.addIssue({ code: "custom", path: ["incoming", "name"], message: "Must differ from the departing person" });
  });

export const CreateProjectInput = ProjectSchema.extend({ people: PeopleSchema });
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const GithubUrlSchema = z
  .string()
  .trim()
  .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/, "Use https://github.com/owner/repo");

export const StartPipelineInput = z.object({ slug: SlugSchema, mode: z.enum(["CACHED", "LIVE"]).default("LIVE") });
export type StartPipelineInput = z.input<typeof StartPipelineInput>;

/** Every new-project action returns this. `reason` is shown inline in the wizard. */
export type NewProjectResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; pending?: boolean; fieldErrors?: Record<string, string> };

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "input";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/* ------------------------------------------------------------------------- */
/* File kind detection (client-side preview; the server re-detects on ingest) */
/* ------------------------------------------------------------------------- */

export type DetectedKind = "CHAT" | "TASKS" | "NOTES" | "DOC";
export const KIND_LABEL: Record<DetectedKind, string> = {
  CHAT: "Chat export",
  TASKS: "Tasks CSV",
  NOTES: "Notes",
  DOC: "Doc",
};

export type Detection = {
  kind: DetectedKind;
  /** Short, factual description of what was found, e.g. "16 messages · #dev · 3 authors". */
  detail: string;
  /** Strings that look like secrets, emails or phone numbers; redacted on the server before any LLM call. */
  toRedact: number;
  suggestedAccess: AccessLevel;
};

const SECRET_RE = /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S{8,}|\b[a-z]{2,6}_(?:live|test)_[A-Za-z0-9]{12,}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g;

export function countRedactions(text: string): number {
  const secrets = new Set(text.match(SECRET_RE) ?? []);
  // A secret assignment can contain a prefixed token; count each distinct value once.
  const emails = new Set(text.match(EMAIL_RE) ?? []);
  const phones = new Set(text.match(PHONE_RE) ?? []);
  let secretCount = 0;
  const seen: string[] = [];
  for (const s of secrets) {
    if (seen.some((x) => x.includes(s) || s.includes(x))) continue;
    seen.push(s);
    secretCount++;
  }
  return secretCount + emails.size + phones.size;
}

const RESTRICTED_HINT = /budget|sponsor|finance|salary|payroll|password|secret|credential|invoice|bank/i;
const NOTES_HINT = /meeting|minutes|notes|sync|standup|retro|\d{4}-\d{2}-\d{2}/i;
const TASK_COLUMNS = ["card", "list", "status", "due", "assignee", "members", "labels", "task"];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function detectFile(name: string, text: string | null): Detection {
  const ext = extOf(name);
  const toRedact = text ? countRedactions(text) : 0;
  const restricted = RESTRICTED_HINT.test(name);
  const base = (kind: DetectedKind, detail: string): Detection => ({
    kind,
    detail,
    toRedact,
    suggestedAccess: restricted ? "RESTRICTED" : "TEAM",
  });

  if (ext === "docx") return base(NOTES_HINT.test(name) ? "NOTES" : "DOC", "Word document · text extracted on upload");
  if (ext === "pdf") return base(NOTES_HINT.test(name) ? "NOTES" : "DOC", "PDF · text extracted on upload (scanned PDFs have no text)");
  if (ext === "zip") return base("CHAT", "Slack export · public channels Team, private channels and DMs Restricted");
  if (text === null) return base("DOC", "Could not read file");

  if (ext === "json") {
    try {
      const data = JSON.parse(text) as unknown;
      const chat = chatStats(data);
      if (chat) return base("CHAT", chat);
      const keys = data && typeof data === "object" ? Object.keys(data as object).length : 0;
      return base("DOC", `JSON · ${plural(keys, "top-level key")}`);
    } catch {
      return base("DOC", "JSON could not be parsed");
    }
  }

  if (ext === "csv") {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const header = (lines[0] ?? "").toLowerCase();
    const rows = Math.max(0, lines.length - 1);
    const cols = header ? header.split(",").length : 0;
    const taskLike = TASK_COLUMNS.filter((c) => header.includes(c)).length >= 2;
    if (taskLike) {
      const listIdx = header.split(",").findIndex((h) => /list|status/.test(h));
      const lists = new Set(lines.slice(1).map((l) => splitCsvLine(l)[listIdx]).filter(Boolean));
      return base("TASKS", `${plural(rows, "card")}${listIdx >= 0 ? ` · ${plural(lists.size, "list")}` : ""}`);
    }
    return base("DOC", `${plural(rows, "row")} · ${plural(cols, "column")}`);
  }

  // .md / .txt
  const lines = text.split(/\r?\n/);
  const chatLines = lines.filter((l) => /^\[?\d{1,2}[/.:-]\d{1,2}.*?\]?\s*[-–]?\s*[^:]{2,40}:\s/.test(l)).length;
  if (ext === "txt" && chatLines >= 5 && chatLines / Math.max(1, lines.length) > 0.5)
    return base("CHAT", `${plural(chatLines, "message")} · plain-text chat log`);
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const isNotes = NOTES_HINT.test(name) || /^(attendees|present|agenda|action items)\b/im.test(text);
  const detail = [headings ? plural(headings, "heading") : null, plural(nonEmpty, "line")].filter(Boolean).join(" · ");
  return base(isNotes ? "NOTES" : "DOC", detail);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

type Msg = { author?: { name?: string } | string; content?: string; text?: string };

function chatStats(data: unknown): string | null {
  // Discord (DiscordChatExporter): { channels: [{ channel, messages }] } or { channel, messages }
  const d = data as { channels?: { channel?: { name?: string }; messages?: Msg[] }[]; channel?: { name?: string }; messages?: Msg[] };
  const channels = Array.isArray(d?.channels)
    ? d.channels
    : Array.isArray(d?.messages)
      ? [{ channel: d.channel, messages: d.messages }]
      : Array.isArray(data)
        ? [{ channel: undefined, messages: data as Msg[] }]
        : null;
  if (!channels) return null;
  const msgs = channels.flatMap((c) => (Array.isArray(c.messages) ? c.messages : []));
  if (!msgs.length || !msgs.every((m) => m && typeof m === "object" && ("content" in m || "text" in m))) return null;
  const authors = new Set(msgs.map((m) => (typeof m.author === "string" ? m.author : m.author?.name)).filter(Boolean));
  const names = channels.map((c) => c.channel?.name).filter(Boolean) as string[];
  return [
    plural(msgs.length, "message"),
    names.length ? names.map((n) => `#${n}`).join(" ") : null,
    authors.size ? plural(authors.size, "author") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
