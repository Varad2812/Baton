import { joinTeam } from "@/app/_actions/team";
import { TeamForm } from "@/components/team-form";

export const metadata = { title: "Accept an invitation · Baton", referrer: "no-referrer" as const, robots: { index: false } };
export default async function Join({params}: {params:Promise<{token:string}>}) {
  const {token} = await params;
  return <main className="mx-auto max-w-lg px-5 py-12"><h1 className="font-serif text-3xl">Join this handover</h1>
    <p className="my-4 text-muted">Accept in the browser you will use for this project. Save the team page after accepting to return to your handover.</p>
    <TeamForm action={joinTeam.bind(null,token)} label="Accept invitation"/>
  </main>;
}
