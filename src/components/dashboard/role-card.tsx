import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import type { NextStep } from "@/lib/views/next-step";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type People = { owner: string; successor: string; reviewer: string };

const JOB: Record<Role, (p: People) => string> = {
  OWNER: () => "Answer what the records can't, so nothing leaves with you. The reviewer approves; you can't approve your own handover.",
  REVIEWER: (p) => `Settle conflicts, check the facts, then approve one signed-off version for ${p.successor}.`,
  INCOMING: (p) => `Read your handover, acknowledge each section, and ask about anything unclear. Questions the records can't answer go to ${p.owner}.`,
  OBSERVER: () => "Read the public facts and the public part of the handover. Nothing to approve or answer.",
};

/** Links shown next to the Next step (the first two that are not the Next step itself). */
function extraLinks(role: Role, base: string, p: People): { label: string; href: string }[] {
  const all: Record<Role, { label: string; href: string }[]> = {
    OWNER: [
      { label: `Answer questions`, href: `${base}/interview` },
      { label: "Add sources", href: `${base}/sources/add` },
      { label: "Check the facts", href: `${base}/ledger` },
    ],
    REVIEWER: [
      { label: "Resolve conflicts", href: `${base}/conflicts` },
      { label: "Review & approve", href: `${base}/review` },
      { label: "Check the facts", href: `${base}/ledger` },
    ],
    INCOMING: [
      { label: `Open ${p.successor}'s handover`, href: `${base}/handover` },
      { label: "Ask the handover", href: `${base}/ask` },
      { label: "Browse the facts", href: `${base}/ledger` },
    ],
    OBSERVER: [
      { label: "Browse public facts", href: `${base}/ledger` },
      { label: `${p.successor}'s handover (public view)`, href: `${base}/handover` },
    ],
  };
  return all[role];
}

/** "You are X. Your job: …" with the one Next step and at most two quieter links. */
export function RoleCard({
  name,
  roleTitle,
  role,
  step,
  slug,
  people,
}: {
  name: string;
  roleTitle: string;
  role: Role;
  step: NextStep;
  slug: string;
  people: People;
}) {
  const base = `/p/${slug}`;
  const stepPath = step.href.split("?")[0];
  const links = extraLinks(role, base, people)
    .filter((l) => l.href !== stepPath)
    .slice(0, 2);
  return (
    <section aria-label="Your job here" data-testid="role-card" className="rounded-lg border border-primary/30 bg-surface px-5 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={name} size={32} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-text">
            You are <strong className="font-semibold">{name}</strong>
            <span className="text-muted">, {roleTitle.toLowerCase()}.</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            <span className="text-subtle">Your job: </span>
            {JOB[role](people)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 sm:pl-11">
        <Link href={step.href} data-try="next-step" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4 text-[14px]")}>
          Next step: {step.label}
          <ArrowRight className="size-4" />
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-[13px] text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {l.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle sm:pl-11">{step.reason}</p>
    </section>
  );
}
