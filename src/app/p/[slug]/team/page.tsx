import { notFound } from "next/navigation";
import { ownedTeam } from "@/lib/team";
import { prisma } from "@/lib/db";
import { manageTeam } from "@/app/_actions/team";
import { TeamForm } from "@/components/team-form";

export default async function TeamPage({ params }: { params: Promise<{slug: string}> }) {
  const { slug } = await params;
  const project = await ownedTeam(slug).catch(() => notFound());
  const invites = await prisma.teamInvite.findMany({ where: { projectId: project.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
  const action = manageTeam.bind(null, slug);
  return <section className="max-w-xl"><h1 className="font-serif text-3xl">Team invitations</h1>
    <p className="mt-2 text-sm text-muted">Creating an invitation makes you the owner of this workspace and turns off persona switching here. The reviewer approves versions. The successor reads and acknowledges them.</p>
    <TeamForm action={action} label="Create invitation"><label className="block text-sm">Invite as <select name="role" className="ml-2 rounded border border-border bg-surface p-2"><option value="REVIEWER">Reviewer</option><option value="INCOMING">Successor</option></select></label>
    <p className="text-xs text-muted">Links expire after seven days. Creating a new link for a role replaces its previous invitation.</p></TeamForm>
    {invites.map(i => <TeamForm key={i.id} action={action} label="Revoke access">
      <input type="hidden" name="intent" value="revoke"/><input type="hidden" name="id" value={i.id}/>
      <p>{i.role === "REVIEWER" ? "Reviewer" : "Successor"} · {i.visitorId ? "Accepted" : "Waiting for teammate"} · expires {i.expiresAt.toISOString().slice(0,10)}</p>
    </TeamForm>)}
  </section>;
}
