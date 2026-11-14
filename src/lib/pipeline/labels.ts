// Short, human labels for sources, used in grade reasons and question rationales:
// "PR #84", "Issue #31", "#dev 12-Mar", "notes 14-Mar (approved)", "Trello FF-124".

import type { PChunk, PSource } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-12T..." -> "12-Mar" in IST. */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MONTHS[d.getUTCMonth()]}`;
}

export function sourceLabel(src: PSource, chunk?: Pick<PChunk, "locator" | "timestamp"> | null): string {
  const head = src.title.split(" · ")[0];
  switch (src.kind) {
    case "GITHUB_PR":
    case "GITHUB_ISSUE":
      return head;
    case "GITHUB_COMMIT": {
      const sha = chunk?.locator.match(/commit ([0-9a-f]{7})/)?.[1];
      return sha ? `commit ${sha}` : "commit history";
    }
    case "CHAT": {
      const ch = src.title.match(/#[\w-]+/)?.[0] ?? "chat";
      const day = shortDay(chunk?.timestamp ?? src.createdAt);
      return day ? `${ch} ${day}` : ch;
    }
    case "TASKS": {
      const card = chunk?.locator.match(/card ([A-Z]+-\d+)/)?.[1];
      return card ? `Trello ${card}` : "task board";
    }
    case "TESTIMONY":
      return `testimony (${src.title.replace(/^Exit interview · /, "exit interview ")})`;
    case "DOC":
    default: {
      const notes = src.title.match(/^Meeting notes (\d{2}-\w{3})(.*)$/);
      if (notes) return `notes ${notes[1]}${notes[2].includes("approved") ? " (approved)" : ""}`;
      return head;
    }
  }
}

/** Distinct labels, first-seen order, max n with "+k more". */
export function joinLabels(labels: string[], n = 4): string {
  const uniq = [...new Set(labels)];
  if (uniq.length <= n) return uniq.join(", ");
  return `${uniq.slice(0, n).join(", ")} +${uniq.length - n} more`;
}
