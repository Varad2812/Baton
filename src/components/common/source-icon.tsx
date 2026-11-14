import {
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  CircleDot,
  MessagesSquare,
  SquareKanban,
  Mic,
} from "lucide-react";
import type { SourceKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ICON: Record<SourceKind, React.ComponentType<{ className?: string }>> = {
  GITHUB_COMMIT: GitCommitHorizontal,
  GITHUB_PR: GitPullRequest,
  GITHUB_ISSUE: CircleDot,
  DOC: FileText,
  CHAT: MessagesSquare,
  TASKS: SquareKanban,
  TESTIMONY: Mic,
};

export function SourceIcon({ kind, className }: { kind: SourceKind; className?: string }) {
  const Icon = ICON[kind];
  return <Icon className={cn("size-3.5 shrink-0", kind === "TESTIMONY" ? "text-[#a98be8]" : "text-subtle", className)} />;
}
