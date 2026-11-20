import Link from "next/link";
import sample from "../../../../seed/finished-handover.json";
import { BriefFacts } from "@/components/brief-facts";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Approved FestFlow handover · Baton" };
export default function FinishedDemo() {
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <Link href="/" className="text-sm text-primary">Baton home</Link>
    <p className="mt-7 text-sm text-muted">FestFlow · Sample project · Successor’s view</p>
    <h1 className="my-2 font-serif text-4xl">Your handover, {sample.successor.split(" ")[0]}</h1>
    <p className="text-sm text-verified">Approved v{sample.version} by {sample.reviewer}</p>
    <section className="my-6 rounded-lg border border-border bg-surface p-5"><h2 className="font-serif text-xl">Your first week</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{sample.plan7.map(p=><li key={p}>{p}</li>)}</ol>
      <p className="mt-3 text-sm text-muted">Reviewer’s note: {sample.note}</p>
    </section>
    <nav aria-label="Explore the working demo" className="flex flex-wrap gap-3">
      <Link href="/p/festflow" prefetch={false} className={buttonVariants()}>Try the workflow</Link>
      <Link href="/p/festflow/ask" prefetch={false} className={buttonVariants({variant:"outline"})}>Ask the editable handover</Link>
      <Link href="/p/festflow/radar" prefetch={false} className={buttonVariants({variant:"outline"})}>Knowledge at risk</Link>
      <Link href="/p/festflow/sources/add?method=slack" prefetch={false} className={buttonVariants({variant:"outline"})}>Try Slack import</Link>
    </nav>
    <p className="mt-2 text-sm text-muted">These tools open your private working draft. The approved example stays available here.</p>
    <details className="my-6"><summary className="cursor-pointer text-primary">Your first 30 days</summary><ul className="mt-2 list-disc pl-5">{sample.plan30.map(p=><li key={p}>{p}</li>)}</ul></details>
    <BriefFacts sections={sample.sections}/>
  </main>;
}
