"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { labelSource } from "@/app/_actions/pipeline";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Access = "PUBLIC" | "TEAM" | "RESTRICTED";
const LABEL: Record<Access, string> = { PUBLIC: "Public", TEAM: "Team", RESTRICTED: "Restricted" };
const TONE: Record<Access, string> = {
  PUBLIC: "text-muted",
  TEAM: "text-single",
  RESTRICTED: "text-primary",
};

/** OWNER-only access label editor. Chunks inherit the label and affected claims are re-graded on the server. */
export function AccessSelect({ slug, sourceId, access, title, isTestimony }: { slug: string; sourceId: string; access: Access; title: string; isTestimony: boolean }) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={`Access label for ${title}`}
        value={access}
        disabled={pending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.target.value as Access;
          start(async () => toast(await labelSource({ slug, sourceId, access: next }), undefined));
        }}
        className={cn(
          "h-6 rounded-[5px] border border-border bg-surface-2 py-0 pl-1.5 pr-5 text-[11.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
          TONE[access],
        )}
      >
        {(Object.keys(LABEL) as Access[]).map((a) => (
          <option key={a} value={a} disabled={isTestimony && a === "PUBLIC"}>
            {LABEL[a]}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="absolute -right-4 size-3 animate-spin text-subtle" />}
    </span>
  );
}
