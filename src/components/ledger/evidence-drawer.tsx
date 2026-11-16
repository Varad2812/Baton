// Server component: the URL-driven (?claim=) evidence drawer, shared by the ledger and the dashboard.
import { Lock } from "lucide-react";
import { projectPersonas } from "@/lib/authz";
import { can, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { demoId } from "@/lib/demo";
import type { ClaimFull } from "@/lib/views/claims";
import { RequestAccess } from "@/components/handover/request-access";
import { EmptyState } from "@/components/ui/empty-state";
import { ClaimDrawerShell } from "@/components/ledger/claim-drawer";
import { ClaimDetail, ClaimSubtitle, type ConflictInfo } from "@/components/ledger/claim-detail";
import { ClaimActions } from "@/components/ledger/claim-actions";

export async function EvidenceDrawer({
  slug,
  projectId,
  actor,
  visible,
  claimId: rawClaimId,
}: {
  slug: string;
  projectId: string;
  actor: Actor;
  /** Claims the persona may see (from loadClaims). A hidden claim is never looked up beyond existence. */
  visible: ClaimFull[];
  claimId: string | undefined;
}) {
  if (!rawClaimId) return null;
  const claimId = demoId(slug, rawClaimId);
  const selected = visible.find((c) => c.id === claimId);
  if (!selected) {
    const exists = (await prisma.claim.count({ where: { id: claimId, projectId } })) > 0;
    if (!exists) return null;
    return (
      <ClaimDrawerShell title="Claim hidden at your access level">
        <EmptyState
          icon={<Lock />}
          title="1 fact hidden — request access from owner"
          description={`This claim cites a source outside what the ${actor.role.toLowerCase()} role may see. Its title, statement and quotes are never sent to your browser.`}
          action={<RequestAccess slug={slug} />}
        />
      </ClaimDrawerShell>
    );
  }
  const rowsC = await prisma.conflict.findMany({
    where: { projectId, OR: [{ claimAId: selected.id }, { claimBId: selected.id }] },
  });
  const byId = new Map(visible.map((c) => [c.id, c]));
  const conflicts: ConflictInfo[] = rowsC.map((c) => {
    const role = c.claimAId === selected.id ? "A" : "B";
    return {
      id: c.id,
      kind: c.kind,
      status: c.status,
      note: c.note,
      role,
      partner: byId.get(role === "A" ? c.claimBId : c.claimAId) ?? null,
    };
  });
  const valid = selected.evidence.filter((e) => e.quoteValid).length;
  return (
    <ClaimDrawerShell
      title={selected.title}
      subtitle={<ClaimSubtitle claim={selected} />}
      footer={
        <>
          <span className="font-mono text-[11px] text-subtle">
            {selected.evidence.length} quote{selected.evidence.length === 1 ? "" : "s"} ·{" "}
            {valid === selected.evidence.length ? "all string-matched" : `${valid} string-matched`}
          </span>
          <ClaimActions
            slug={slug}
            claimId={selected.id}
            statement={selected.statement}
            rejected={selected.status === "REJECTED"}
            canEdit={can(actor.role, "edit_claims")}
            canAsk={can(actor.role, "ask_followups")}
            section={selected.section}
          />
        </>
      }
    >
      <ClaimDetail claim={selected} conflicts={conflicts} slug={slug} ownerName={(await projectPersonas(slug)).meera.name.split(" ")[0]} />
    </ClaimDrawerShell>
  );
}
