// Pure formatting helpers shared by server and client components.
import type { ClaimType, Grade, SourceKind, Access, Role } from "@/generated/prisma/enums";

const TZ = "Asia/Kolkata";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: TZ });
}

export function fmtDateYear(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

/** "12-Mar" style, as used in grade reasons and citations. */
export function fmtDash(d: Date | string | null | undefined): string {
  if (!d) return "";
  return fmtDate(d).replace(" ", "-");
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export const GRADE_ORDER: Grade[] = ["VERIFIED", "SINGLE_SOURCE", "INFERRED", "CONFLICTING", "MISSING"];

export const GRADE_LABEL: Record<Grade, string> = {
  VERIFIED: "Confirmed (2+ sources)",
  SINGLE_SOURCE: "Single source",
  INFERRED: "AI inference (unconfirmed)",
  CONFLICTING: "Conflicting",
  MISSING: "Missing",
};

/** One plain sentence per grade, shown in (i) tooltips and the glossary. */
export const GRADE_HELP: Record<Grade, string> = {
  VERIFIED: "Backed by an exact quote in two or more independent sources, or by one authoritative record such as a merged PR.",
  SINGLE_SOURCE: "Backed by exactly one quoted source. Probably right, but nothing else confirms it.",
  INFERRED: "The AI concluded this from patterns; no record says it directly. Treat as a guess until someone confirms.",
  CONFLICTING: "Two sources disagree and nobody has decided which is right yet.",
  MISSING: "Something a handover needs that no record mentions. Only the person leaving can fill it in.",
};

/** Compact names for chips and table cells. */
export const GRADE_SHORT: Record<Grade, string> = {
  VERIFIED: "Confirmed",
  SINGLE_SOURCE: "Single source",
  INFERRED: "AI inference",
  CONFLICTING: "Conflicting",
  MISSING: "Missing",
};

export const GRADE_COLOR: Record<Grade, string> = {
  VERIFIED: "var(--grade-verified)",
  SINGLE_SOURCE: "var(--grade-single)",
  INFERRED: "var(--grade-inferred)",
  CONFLICTING: "var(--grade-conflicting)",
  MISSING: "var(--grade-missing)",
};

export const TYPE_LABEL: Record<ClaimType, string> = {
  DECISION: "Decision",
  TASK: "Task",
  RISK: "Risk",
  DEPENDENCY: "Dependency",
  CONTACT: "Contact",
  QUESTION: "Question",
  RECURRING: "Recurring",
};

export const KIND_LABEL: Record<SourceKind, string> = {
  GITHUB_COMMIT: "Commits",
  GITHUB_PR: "Pull request",
  GITHUB_ISSUE: "Issue",
  DOC: "Document",
  CHAT: "Chat",
  TASKS: "Task board",
  TESTIMONY: "Testimony",
};

export const ACCESS_LABEL: Record<Access, string> = {
  PUBLIC: "Public",
  TEAM: "Team",
  RESTRICTED: "Restricted",
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  REVIEWER: "Reviewer",
  INCOMING: "Incoming",
  OBSERVER: "Observer",
};

/** Short citation label for a chunk: "PR #84", "notes 14-Mar", "#dev 12-Mar", "Trello FF-101". */
export function citationLabel(
  source: { kind: SourceKind; title: string },
  chunk: { locator: string; timestamp: Date | string | null; text?: string },
  matchStart?: number | null,
): string {
  const head = source.title.split(" · ")[0];
  switch (source.kind) {
    case "GITHUB_PR":
    case "GITHUB_ISSUE": {
      const m = chunk.locator.match(/comment (\d+)/);
      return m ? `${head} c${m[1]}` : head;
    }
    case "GITHUB_COMMIT":
      return chunk.locator;
    case "CHAT": {
      const ch = chunk.locator.split(" ")[0];
      // Date of the quoted message, not of the first message in the chunk.
      if (chunk.text && matchStart != null) {
        const stamps = [...chunk.text.slice(0, matchStart).matchAll(/\[(\d{4}-\d{2}-\d{2})/g)];
        const last = stamps.at(-1)?.[1];
        if (last) return `${ch} ${fmtDash(`${last}T12:00:00+05:30`)}`;
      }
      return `${ch} ${fmtDash(chunk.timestamp)}`;
    }
    case "TASKS": {
      if (chunk.text && matchStart != null) {
        const card = [...chunk.text.slice(0, matchStart).matchAll(/(FF-\d+) ·/g)].at(-1)?.[1];
        if (card) return `Trello ${card}`;
      }
      const m = chunk.locator.match(/FF-\d+/);
      return m ? `Trello ${m[0]}` : "Trello";
    }
    case "TESTIMONY":
      return chunk.locator;
    case "DOC": {
      const notes = source.title.match(/Meeting notes (\d{2}-\w{3})/);
      if (notes) return `notes ${notes[1]}`;
      if (/budget/i.test(source.title)) return "budget sheet";
      return source.title.replace(/^docs\//, "");
    }
  }
}

/** Area-level owner label used by bus-factor ("services/email-templates" → "email-templates"). */
export function shortArea(area: string): string {
  return area.split("/").pop() ?? area;
}
