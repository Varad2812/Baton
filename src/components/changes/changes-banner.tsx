import Link from "next/link";
import { GitPullRequestArrow } from "lucide-react";
import { can, type Actor } from "@/lib/authz";
import { changeSummary, type ChangeSet } from "@/lib/handover/changes";
import { buttonVariants } from "@/components/ui/button";

/** "v1 is out of date: 4 new facts, 1 contradiction" with the next step for this persona. */
export function ChangesBanner({ changes, slug, actor, reviewer }: { changes: ChangeSet | null; slug: string; actor: Actor; reviewer: string }) {
  if (!changes || changes.total === 0) return null;
  const canApprove = can(actor.role, "approve_version");
  return (
    <div role="status" data-testid="changes-banner" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/[0.07] px-4 py-3 print:hidden">
      <GitPullRequestArrow className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium text-text">
          v{changes.version} is out of date: {changeSummary(changes)}.
        </p>
        <p className="text-xs text-muted">
          New records arrived after approval. {canApprove ? "Review only what changed, then approve the next version." : `${reviewer} reviews the changes and approves v${changes.version + 1}.`}
        </p>
      </div>
      <Link href={`/p/${slug}/review?changes=1`} className={buttonVariants({ size: "sm", variant: canApprove ? "default" : "outline" })} data-draft-next>
        {canApprove ? `Draft v${changes.version + 1}` : "See what changed"}
      </Link>
    </div>
  );
}

/** "What changed since v1" list (handover page, after a later version is approved). */
export function ChangeList({ changes, slug }: { changes: ChangeSet; slug: string }) {
  const link = (id: string, title: string) => (
    <Link href={`/p/${slug}/ledger?claim=${encodeURIComponent(id)}`} className="text-text hover:underline">
      {title}
    </Link>
  );
  const groups: { label: string; tone: string; items: React.ReactNode[] }[] = [
    { label: "New", tone: "text-single", items: changes.newFacts.map((c) => link(c.id, c.title)) },
    {
      label: "Contradicted",
      tone: "text-conflicting",
      items: changes.contradicted.map((x) => (
        <>
          {link(x.claim.id, x.claim.title)} <span className="text-subtle">vs</span> {link(x.by.id, x.by.title)}
        </>
      )),
    },
    {
      label: "Outdated",
      tone: "text-missing",
      items: changes.outdated.map((x) => (
        <>
          <span className="text-muted line-through decoration-subtle">{x.claim.title}</span> <span className="text-subtle">→</span> {link(x.by.id, x.by.title)}
        </>
      )),
    },
    { label: "Newly confirmed", tone: "text-verified", items: changes.confirmed.map((c) => link(c.id, c.title)) },
  ].filter((g) => g.items.length);
  return (
    <div className="divide-y divide-border">
      {groups.map((g) => (
        <div key={g.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13px]">
          <div className={`text-xs font-medium uppercase tracking-wide ${g.tone}`}>
            {g.label} <span className="font-mono text-subtle">{g.items.length}</span>
          </div>
          <ul className="space-y-1">
            {g.items.map((it, i) => (
              <li key={i} className="leading-snug">
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
