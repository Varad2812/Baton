import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  OWNER: "border-primary/30 bg-primary/10 text-primary",
  REVIEWER: "border-verified/30 bg-verified/10 text-verified",
  INCOMING: "border-single/30 bg-single/10 text-single",
  OBSERVER: "border-border bg-surface-2 text-muted",
};

const ROLE_WORD: Record<string, string> = {
  OWNER: "owner",
  REVIEWER: "reviewer",
  INCOMING: "successor",
  OBSERVER: "observer",
};

/** Slim strip under the top bar: who you are, and exactly what that hides from you. */
export function PersonaBanner({ name, role, hidden }: { name: string; role: string; hidden: number }) {
  const what =
    role === "OWNER"
      ? "You see everything and answer the questions only you can."
      : role === "REVIEWER"
        ? "You see everything, resolve conflicts and approve versions."
        : role === "INCOMING"
          ? `${hidden} fact${hidden === 1 ? " is" : "s are"} hidden because their sources are restricted. You can acknowledge sections and ask follow-ups.`
          : `Read-only. ${hidden} fact${hidden === 1 ? " is" : "s are"} hidden because their sources are not public.`;
  return (
    <div data-testid="persona-banner" className={cn("flex h-7 items-center gap-1.5 border-b px-6 text-xs", TONE[role] ?? TONE.OBSERVER)}>
      <span>
        You are viewing as <strong className="font-semibold">{name}</strong> ({ROLE_WORD[role] ?? role.toLowerCase()}).
      </span>
      <span className="truncate text-muted">{what}</span>
    </div>
  );
}
