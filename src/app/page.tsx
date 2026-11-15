import Link from "next/link";
import { ArrowRight, FileSearch, MessageSquareQuote, PlayCircle, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getLandingStats } from "@/components/landing/stats";
import { LazyHeroStack, LazyPipelineStaircase } from "@/components/three/lazy";
import { cn } from "@/lib/utils";

// Numbers come from the live FestFlow project; refresh at most once a minute.
export const revalidate = 60;

const n = (v: number | undefined | null) => (v === undefined || v === null ? "—" : v.toLocaleString("en-IN"));

export default async function Home() {
  const s = await getLandingStats();
  const k = s?.byKind ?? {};
  const github = (k.GITHUB_PR ?? 0) + (k.GITHUB_ISSUE ?? 0) + (k.GITHUB_COMMIT ?? 0);

  const layers = [
    { key: "github", label: "GitHub", sub: s ? `${k.GITHUB_PR ?? 0} PRs · ${k.GITHUB_ISSUE ?? 0} issues · commits` : "commits · PRs · issues", color: "#4C7BD9" },
    { key: "chat", label: "Chat", sub: s ? `${k.CHAT ?? 0} Discord channels` : "Discord export", color: "#7A4FD1" },
    { key: "notes", label: "Notes", sub: s ? `${k.DOC ?? 0} docs · meeting notes` : "README · meeting notes", color: "#1F9E89" },
    { key: "tasks", label: "Tasks", sub: "Trello board", color: "#8A8FA3" },
  ];

  const usps = [
    {
      icon: FileSearch,
      title: "Every fact has a receipt",
      line: "Each fact carries the exact quote it came from, string-matched in the source. A fact is only called Confirmed when 2+ sources agree.",
      example: "“Auth moved from Firebase to Supabase” is Confirmed by PR #84, the #dev chat and the 14 Mar notes. The older Firebase fact is shown as replaced, not as a conflict.",
    },
    {
      icon: MessageSquareQuote,
      title: "Asks only what the records cannot answer",
      line: "The departing person gets a short, ranked list of questions. Their answers become cited testimony, marked as such.",
      example: s ? `${s.questions.total} questions, not a blank form. Top one: nothing records who holds the production database password.` : "Nothing records who holds the production database password.",
    },
    {
      icon: ShieldCheck,
      title: "Each person sees only what their role allows",
      line: "Permissions are enforced on the server before any AI call, so restricted sources never reach the model for the wrong person.",
      example: s ? `The sponsor budget sheet is Restricted. ${n(s.leaks)} of ${n(s.canaryViews)} role views leaked its planted canary string.` : "The sponsor budget sheet is Restricted and never appears in a successor's view.",
    },
  ];

  const steps = [
    {
      title: "Connect",
      line: "GitHub, chat exports, docs and task boards, each labelled Public, Team or Restricted.",
      data: s ? `${n(s.sources)} sources · ${n(s.chunks)} chunks · ${n(s.redactions)} redactions` : null,
    },
    {
      title: "Reconstruct",
      line: "Decisions, tasks, risks, owners and contacts found, each citing the chunk it came from.",
      data: s ? `${n(s.claims)} facts · ${n(s.supersessions)} decisions superseded` : null,
    },
    {
      title: "Verify",
      line: "Quotes checked verbatim; graded confirmed, single source, AI inference, conflicting or missing.",
      data: s ? `${n(s.quotes.valid)}/${n(s.quotes.total)} quotes matched · ${n(s.conflicts)} conflicts` : null,
    },
    {
      title: "Review",
      line: "The reviewer resolves conflicts and approves an immutable version. No self-approval.",
      data: s ? `${n(s.questions.total)} gap questions · ${n(s.questions.answered)} answered` : null,
    },
    {
      title: "Handover",
      line: "A role-safe briefing with a 7- and 30-day plan, acknowledged section by section.",
      data: s ? (s.versions ? `v${s.versions} approved` : `status: ${(s.handoverStatus ?? "draft").toLowerCase().replace("_", " ")}`) : null,
    },
  ];

  const stats = [
    { label: "Sources", value: n(s?.sources), sub: s ? `${github} GitHub · ${k.CHAT ?? 0} chat · ${k.DOC ?? 0} docs` : "FestFlow demo" },
    { label: "Facts found", value: n(s?.claims), sub: s ? `${n(s.quotes.total)} evidence quotes` : "graded with receipts" },
    { label: "Confirmed", value: s ? `${s.verifiedPct}%` : "—", sub: s ? `${s.grades.VERIFIED} facts, 2+ sources or 1 authoritative` : "≥2 independent sources" },
    { label: "Conflicts caught", value: n(s?.conflicts), sub: s ? `+${s.supersessions} superseded, shown as evolution` : "contradictions across sources" },
    { label: "Nobody wrote down", value: n(s?.gaps), sub: s ? `nothing on record · ${s.questions.total - s.questions.answered} questions open` : "asked in the exit interview" },
    { label: "Leaks", value: s ? String(s.leaks) : "—", sub: s ? `canary scan across ${s.canaryViews} restricted views` : "canary scan per role", good: s?.leaks === 0 },
  ];

  const stairs = s
    ? [
        { key: "connect", label: "Connect", status: "done" as const, count: s.sources, unit: "sources" },
        { key: "reconstruct", label: "Reconstruct", status: "done" as const, count: s.claims, unit: "facts" },
        { key: "verify", label: "Verify", status: "done" as const, count: s.quotes.valid, unit: "quotes" },
        { key: "review", label: "Review", status: s.versions ? ("done" as const) : ("running" as const), count: s.questions.total, unit: "questions" },
        { key: "handover", label: "Handover", status: s.versions ? ("done" as const) : ("idle" as const), count: s.versions, unit: "versions" },
      ]
    : steps.map((st, i) => ({ key: st.title.toLowerCase(), label: st.title, status: i < 3 ? ("done" as const) : ("idle" as const) }));

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      {/* The page's one soft glow: amber, behind the approved-handover slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[900px]"
        style={{ background: "radial-gradient(520px 380px at 72% 30%, rgba(232,163,61,0.085), transparent 70%)" }}
      />

      <header className="relative z-10 border-b border-border/70">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link href="/" prefetch={false} className="flex items-center gap-2">
            <BatonMark />
            <span className="font-serif text-[17px] font-semibold tracking-tight">Baton</span>
          </Link>
          <nav className="flex items-center gap-1 text-[13px]">
            <a href="#how" className="hidden rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:inline">
              How it works
            </a>
            <Link href="/p/festflow/trust" prefetch={false} className="hidden rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:inline">
              Trust report
            </Link>
            <Link href="/p/festflow" prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-2")}>
              Open live demo
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-6 px-6 pt-10 pb-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-12">
          <div className="max-w-[520px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
              <span className="size-1.5 rounded-full bg-verified" />
              FestFlow demo is live · no login · reset any time
            </p>
            <h1 className="mt-5 font-serif text-[56px] leading-none font-semibold tracking-tight">Baton</h1>
            <p className="mt-3 font-serif text-[22px] leading-snug text-text">Hand over the project, not just the files.</p>
            <dl className="mt-5 space-y-2 text-[14px] leading-snug">
              {[
                ["What", "Reads a project's commits, chats, docs and tasks and writes the handover for you."],
                ["For", "Anyone leaving a team, and the person taking over."],
                ["Why trust it", "Every fact links to the exact quote it came from. No quote, no fact."],
                ["Try it", "Open the finished FestFlow handover. No login, two minutes."],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[84px_1fr] gap-3">
                  <dt className="font-medium text-primary">{k}</dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link href="/p/festflow" className={buttonVariants({ size: "lg" })}>
                See a finished handover (2-min demo)
                <ArrowRight />
              </Link>
              <Link href="/new" prefetch={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Try with your own files
              </Link>
              <Link
                href="/p/festflow?tour=1"
                prefetch={false}
                className="ml-1 inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-[13px] text-muted hover:text-text"
              >
                <PlayCircle className="size-4" />
                60-second tour
              </Link>
            </div>
          </div>

          <div className="relative h-[460px] sm:h-[540px] lg:h-[600px]">
            <LazyHeroStack
              layers={layers}
              grades={s?.grades}
              approvedSub={s ? `${s.claims} facts · ${s.verifiedPct}% confirmed` : undefined}
            />
          </div>
        </section>

        <section className="border-y border-border bg-surface/60">
          <dl className="mx-auto grid max-w-[1240px] grid-cols-2 px-6 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((st, i) => (
              <div
                key={st.label}
                className={cn("py-5 pr-4", i > 0 && "lg:border-l lg:border-border lg:pl-5", i % 3 !== 0 && "sm:max-lg:border-l sm:max-lg:border-border sm:max-lg:pl-5")}
              >
                <dt className="text-[12px] text-muted">{st.label}</dt>
                <dd className={cn("mt-1 font-mono text-[28px] leading-none font-semibold tabular-nums", st.good ? "text-verified" : "text-text")}>
                  {st.value}
                </dd>
                <dd className="mt-1.5 text-[11.5px] leading-snug text-subtle">{st.sub}</dd>
              </div>
            ))}
          </dl>
          <p className="mx-auto max-w-[1240px] px-6 pb-3 font-mono text-[10.5px] text-subtle">
            Live from the FestFlow project database. Records Jan–Apr 2026.
          </p>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 pt-14" aria-labelledby="three-steps">
          <h2 id="three-steps" className="font-serif text-[28px] font-semibold tracking-tight">Three steps</h2>
          <ol className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            {[
              ["1", "Connect sources", "GitHub, chat exports, docs, task boards. You label each Public, Team or Restricted.", s ? `${n(s.sources)} sources · ${n(s.chunks)} excerpts` : ""],
              ["2", "Baton finds and checks every fact", "Each fact is matched word for word to its source. Disagreements and gaps are flagged, not hidden.", s ? `${n(s.claims)} facts · ${n(s.conflicts)} conflicts · ${s.questions.total} questions` : ""],
              ["3", "Successor gets an approved plan", "A reviewer signs off. Each person sees only what their role allows, with a 7 and 30 day plan.", s ? `${s.versions ? "v" + s.versions + " approved" : "awaiting approval"} · ${s.leaks} leaks` : ""],
            ].flatMap(([num, title, line, data], i) => {
              const card = (
                <li key={num} className="rounded-lg border border-border bg-surface p-4">
                  <span className="flex size-6 items-center justify-center rounded-full border border-primary/50 font-mono text-xs text-primary">{num}</span>
                  <h3 className="mt-3 text-[15px] font-medium text-text">{title}</h3>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{line}</p>
                  {data && <p className="mt-3 font-mono text-[11px] text-subtle">{data}</p>}
                </li>
              );
              return i < 2 ? [card, <li key={`a${i}`} aria-hidden className="hidden items-center text-subtle md:flex"><ArrowRight className="size-4" /></li>] : [card];
            })}
          </ol>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 pt-14" aria-labelledby="different">
          <h2 id="different" className="font-serif text-[28px] font-semibold tracking-tight">What makes it different</h2>
          <div className="mt-5 divide-y divide-border rounded-lg border border-border">
            {usps.map((u) => (
              <div key={u.title} className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[240px_1fr_1fr] md:gap-6">
                <div className="flex items-start gap-2.5">
                  <u.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-[14px] font-medium text-text">{u.title}</span>
                </div>
                <p className="text-[13px] leading-snug text-muted">{u.line}</p>
                <p className="rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] leading-snug text-muted">
                  <span className="mb-0.5 block font-mono text-[10.5px] uppercase tracking-wide text-subtle">In FestFlow</span>
                  {u.example}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1240px] scroll-mt-6 px-6 py-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-[28px] font-semibold tracking-tight">How it works</h2>
            <Link href="/p/festflow/sources" prefetch={false} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
              Watch the pipeline run <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <span className="text-[12px] font-medium text-text">FestFlow pipeline</span>
                <span className="truncate font-mono text-[10.5px] text-subtle">{s?.people ? `${s.people.from} → ${s.people.to} · reviewer ${s.people.reviewer}` : "owner → successor · reviewer"}</span>
              </div>
              <div className="flex flex-1 items-center">
                <LazyPipelineStaircase stages={stairs} />
              </div>
              <dl className="grid grid-cols-3 border-t border-border font-mono text-[11px]">
                {[
                  ["Last run", s?.run ? `${s.run.mode.toLowerCase()} · ${(s.run.ms / 1000).toFixed(1)} s` : "—"],
                  ["Model", s?.run?.model ?? "—"],
                  ["Stages", s?.run ? `${s.run.stages} streamed` : "—"],
                ].map(([k, v], i) => (
                  <div key={k} className={cn("min-w-0 px-4 py-2.5", i > 0 && "border-l border-border")}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="truncate text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <ol className="divide-y divide-border rounded-lg border border-border">
              {steps.map((st, i) => (
                <li key={st.title} className="grid grid-cols-[24px_104px_minmax(0,1fr)] items-baseline gap-3 px-4 py-3 max-sm:grid-cols-[24px_minmax(0,1fr)]">
                  <span className="font-mono text-[11px] text-muted">0{i + 1}</span>
                  <span className="text-[13.5px] font-medium text-text">{st.title}</span>
                  <div className="max-sm:col-start-2">
                    <p className="text-[13px] leading-snug text-muted">{st.line}</p>
                    {st.data && <p className="mt-1 font-mono text-[10.5px] text-muted">{st.data}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12px] text-muted">
          <span>Akshaya · VIT Pune · Varad Rathor, Kartik Patil, Rohan Agasti</span>
          <span className="font-mono text-[11px]">Baton · knowledge handover with receipts</span>
          <div className="flex gap-4">
            <Link href="/p/festflow" prefetch={false} className="hover:text-text">Live demo</Link>
            <Link href="/new" prefetch={false} className="hover:text-text">New handover</Link>
            <Link href="/p/festflow/trust" prefetch={false} className="hover:text-text">Trust report</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BatonMark() {
  // Four stacked layers and an amber top: the hero stack, flattened.
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <rect x="3" y="14" width="14" height="2" rx="0.5" fill="#4C7BD9" opacity="0.8" />
      <rect x="3" y="10.5" width="14" height="2" rx="0.5" fill="#7A4FD1" opacity="0.8" />
      <rect x="3" y="7" width="14" height="2" rx="0.5" fill="#1F9E89" opacity="0.8" />
      <rect x="3" y="2.5" width="14" height="3" rx="0.75" fill="#E8A33D" />
    </svg>
  );
}
