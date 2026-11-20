import { notFound } from "next/navigation";
import { teamSession } from "@/lib/team";
import { approvalState, getRoleView, previewRoleView } from "@/lib/handover/service";
import { allowedAccess, canSeeChunk } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { TeamForm } from "@/components/team-form";
import { teamDecision } from "@/app/_actions/team";
import { BriefFacts } from "@/components/brief-facts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team handover · Baton", robots: { index: false } };
export default async function TeamPortal({ params }: { params: Promise<{id:string}> }) {
  const {id} = await params;
  const {actor, invite} = await teamSession(id).catch(() => notFound());
  const reviewer = actor.role === "REVIEWER";
  const record = await getRoleView(actor, invite.projectId);
  const compiled = reviewer ? (await previewRoleView(actor, invite.projectId)).view.compiled : record.view?.compiled;
  const {blockers} = reviewer ? await approvalState(invite.projectId) : {blockers: []};
  const allowed = await allowedAccess(actor.role, invite.projectId);
  const chunks = await prisma.chunk.findMany({ where:{source:{projectId:invite.projectId}},select:{id:true,access:true,sourceId:true} });
  const ids = new Set(chunks.filter(c => canSeeChunk(allowed,c)).map(c => c.id));
  const liveClaims = await prisma.claim.findMany({where:{projectId:invite.projectId, status:{not:"REJECTED"}},select:{id:true,access:true,evidence:{select:{chunkId:true}}}});
  const visible = new Set(liveClaims.filter(c => c.evidence.length ? c.evidence.every(e => ids.has(e.chunkId)) : allowed.levels.includes(c.access)).map(c => c.id));
  const sections = compiled?.sections.map(s => ({...s,items:s.items.filter(f => visible.has(f.id) && f.evidence.every(e => ids.has(e.chunkId)))})) ?? [];
  const version = record.version?.number ?? 0;
  const ack = record.acknowledgements.some(a => a.section === "Overview");
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <p className="text-sm text-muted">{actor.name} · {reviewer ? "Reviewer" : "Successor"}</p>
    <h1 className="mt-1 font-serif text-3xl">{invite.project.name} handover</h1>
    <p className="my-3">{reviewer ? "Review the draft and its evidence before approving the next version." : record.version ? "Approved v" + version + " by " + record.version.approvedBy : "Your reviewer has not approved a version yet. Return here after approval."}</p>
    {compiled && <><BriefFacts sections={sections}/>
      {reviewer && blockers.length > 0 && <div><h2 className="font-semibold">Open approval items</h2><ul className="list-disc pl-5">{blockers.map(b=><li key={b.id}>{b.label}</li>)}</ul></div>}
      {!reviewer && ack ? <p>Handover acknowledged.</p> : <TeamForm action={teamDecision.bind(null,id)} label={reviewer ? "Approve v" + (version+1) : "Acknowledge this handover"}>
        <input type="hidden" name="version" value={reviewer ? version+1 : version}/>
        {reviewer && blockers.length > 0 && <><label className="block"><input type="checkbox" name="override"/> Approve with the listed exceptions</label>
          <label className="block">Reason for the exception <textarea name="note" minLength={10} maxLength={1000} className="block w-full rounded border border-border bg-bg p-2"/></label></>}
      </TeamForm>}
    </>}
  </main>;
}
