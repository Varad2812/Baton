type Fact = { id: string; title: string; statement: string; evidence: { sourceTitle: string; quote: string; locator: string; relation: string }[] };
export function BriefFacts({sections}: {sections: {section: string; items: Fact[]}[]}) {
  return <div className="my-6 space-y-5">{sections.filter(s => s.items.length).map(s => <section key={s.section}>
    <h2 className="mb-2 font-serif text-xl">{s.section}</h2>
    <ul className="space-y-2">{s.items.map(f => <li key={f.id} className="rounded-lg border border-border bg-surface p-4">
      <h3 className="font-medium">{f.title}</h3><p className="mt-1 text-sm text-muted">{f.statement}</p>
      {f.evidence.some(e => e.relation === "SUPPORTS") && <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-primary">Read the source evidence</summary>
        {f.evidence.filter(e => e.relation === "SUPPORTS").map((e,i) => <blockquote key={i} className="my-3 border-l-2 border-primary/50 pl-3">
          <p className="whitespace-pre-line">{e.quote}</p><cite className="text-xs text-muted">{e.sourceTitle} · {e.locator}</cite>
        </blockquote>)}
      </details>}
    </li>)}</ul>
  </section>)}</div>;
}
