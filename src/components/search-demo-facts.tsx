"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { BriefFacts } from "./brief-facts";

export function SearchDemoFacts({ sections }: ComponentProps<typeof BriefFacts>) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length ? sections.map(section => ({
    ...section,
    items: section.items.filter(fact => {
      const text = [section.section, fact.title, fact.statement,
        ...fact.evidence.flatMap(source => [source.sourceTitle, source.quote, source.locator])
      ].join(" ").toLowerCase();
      return terms.every(term => text.includes(term));
    }),
  })) : sections;
  const count = results.reduce((total, section) => total + section.items.length, 0);

  return <section aria-labelledby="find-fact">
    <h2 id="find-fact" className="font-serif text-2xl"><label htmlFor="fact-search">Search the approved handover</label></h2>
    <div className="mt-2 flex gap-2">
      <input id="fact-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Search facts, quotes or source names" className="min-w-0 flex-1 rounded border border-border bg-surface p-2" />
      {query && <button type="button" onClick={() => { setQuery(""); document.getElementById("fact-search")?.focus(); }} className="px-2 text-primary">Clear search</button>}
    </div>
    <p role="status" className="mt-2 text-sm text-muted">{count === 0 ? "No matching facts. Try a source name or a shorter phrase." : count + (count === 1 ? " fact" : " facts")}</p>
    <BriefFacts sections={results}/>
  </section>;
}
