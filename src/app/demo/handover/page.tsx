import Link from "next/link";
import sample from "../../../../seed/finished-handover.json";
import { SearchDemoFacts } from "@/components/search-demo-facts";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Approved FestFlow handover · Baton" };
export default function FinishedDemo() {
  const facts = sample.sections.flatMap(section => section.items);
  const paymentReceipts = ["clm_payment_razorpay", "clm_payment_phonepe"].map(id =>
    facts.find(fact => fact.id === id)?.evidence.find(source => source.relation === "SUPPORTS")
  );
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <Link href="/" className="text-sm text-primary">Baton home</Link>
    <p className="mt-7 text-sm text-muted">FestFlow · Sample project · Successor’s view</p>
    <h1 className="my-2 font-serif text-4xl">Your handover, {sample.successor.split(" ")[0]}</h1>
    <p className="text-sm text-verified">Approved v{sample.version} by {sample.reviewer}</p>
    <section className="my-6 rounded-lg border border-border bg-surface p-5"><h2 className="font-serif text-xl">Your first week</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{sample.plan7.map(task => <li key={task}>{task}
        {task.includes("Payment gateway: Razorpay") && paymentReceipts.every(Boolean) &&
          <details className="my-2 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium text-primary">Compare the payment evidence</summary>
            {paymentReceipts.map(source => source && <blockquote key={source.locator} className="my-3 border-l-2 border-primary/50 pl-3">
              <p>“{source.quote}”</p><cite className="text-muted">{source.sourceTitle} · {source.locator}</cite>
            </blockquote>)}
            <p>Razorpay was approved on 2 April. PhonePe entered testing on 19 April. Confirm which provider went live before enabling payments.</p>
            <Link href="/p/festflow/conflicts#cf_payment" prefetch={false} className="mt-2 inline-block text-primary underline">Review the conflict in your editable copy</Link>
          </details>}
      </li>)}</ol>
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
    <SearchDemoFacts sections={sample.sections}/>
  </main>;
}
