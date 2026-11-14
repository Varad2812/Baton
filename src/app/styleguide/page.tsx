import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { AccessChip } from "@/components/ui/access-chip";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { Avatar } from "@/components/ui/avatar";
import { Timeline } from "@/components/ui/timeline";
import { DataTable } from "@/components/ui/data-table";
import { InteractiveDemos } from "@/components/styleguide/interactive";
import { GRADE_ORDER } from "@/lib/views/format";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Styleguide · Baton", robots: { index: false, follow: false } };

const PEOPLE = ["Meera Kulkarni", "Arjun Mehta", "Prof. S. Rao", "Kabir Shah", "Sana Iyer", "Dev Patil"];
const TOKENS = [
  ["bg", "#0B0D15"],
  ["surface", "#11141F"],
  ["surface-2", "#171B28"],
  ["border", "#252A3A"],
  ["text", "#E8EAF2"],
  ["muted", "#A9AEC2"],
  ["subtle", "#6B7186"],
  ["primary", "#E8A33D"],
  ["verified", "#1F9E89"],
  ["single", "#4C7BD9"],
  ["inferred", "#E8A33D"],
  ["conflicting", "#E2574C"],
  ["missing", "#8A8FA3"],
  ["testimony", "#7A4FD1"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="mb-4 text-[11px] font-medium uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  );
}

export default function Styleguide() {
  return (
      <main className="mx-auto w-full max-w-[1200px] px-8 py-10">
        <h1 className="font-serif text-3xl font-semibold">Baton design system</h1>
        <p className="mt-1 text-[13px] text-muted">Internal reference. Dense, 1px borders, 6–8px radius, tabular numbers.</p>

        <Section title="Tokens">
          <div className="grid grid-cols-7 gap-2">
            {TOKENS.map(([n, hex]) => (
              <div key={n} className="rounded-md border border-border p-2">
                <div className="h-8 rounded" style={{ background: hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }} />
                <p className="mt-1.5 text-xs text-text">{n}</p>
                <p className="font-mono text-[11px] text-subtle">{hex}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-baseline gap-6">
            <span className="font-serif text-2xl font-semibold">Source Serif 4 · titles</span>
            <span className="text-[14px]">Inter · UI 13–14px</span>
            <span className="font-mono text-[13px]">JetBrains Mono · PR #84 · L14 · 127/127</span>
          </div>
        </Section>

        <Section title="Buttons, badges, chips, kbd, avatar">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Approve as v1</Button>
            <Button variant="outline">Open ledger</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Reject</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {GRADE_ORDER.map((g) => (
              <GradeChip key={g} grade={g} />
            ))}
            <AccessChip access="PUBLIC" />
            <AccessChip access="TEAM" />
            <AccessChip access="RESTRICTED" />
            <Badge>neutral</Badge>
            <Badge variant="primary">primary</Badge>
            <Badge variant="success">authoritative</Badge>
            <Badge variant="danger">rejected</Badge>
            <Badge variant="testimony">testimony</Badge>
            <Badge variant="count">67</Badge>
            <Kbd>/</Kbd>
            <Kbd>⌘K</Kbd>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {PEOPLE.map((p) => (
              <Avatar key={p} name={p} size={28} />
            ))}
          </div>
        </Section>

        <Section title="Stat, card, timeline">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Verified" value={48} unit="%" spark={[2, 5, 9, 14, 20, 26, 31, 32]} sparkColor="var(--grade-verified)" footer="32 with ≥2 sources" />
            <Stat label="Open conflicts" value={3} unit="/ 3" delta={-1} deltaGood="down" deltaLabel="since yesterday" />
            <Stat label="Open gaps" value={8} unit="/ 10" footer="4 high priority" />
            <Stat label="Readiness" value={39} unit="/ 100" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Card>
              <CardHeader title="Decision timeline" description="Supersedes vs contradicts" actions={<Badge variant="count">3</Badge>} />
              <CardBody>
                <Timeline
                  items={[
                    { id: "1", date: "12 Mar", from: "Auth on Firebase Authentication", title: "Firebase → Supabase", meta: "PR #84 (merged), #dev 12-Mar, notes 14-Mar", color: "var(--grade-verified)" },
                    { id: "2", date: "14 Feb", from: "Hosted on Vercel", title: "Vercel → Render", meta: "PR #41 (merged), notes 10-Feb", color: "var(--grade-verified)" },
                    { id: "3", date: "19 Apr", title: "PhonePe trial started", meta: "vs Razorpay (decided 2 Apr)", color: "var(--grade-conflicting)" },
                  ]}
                />
              </CardBody>
              <CardFooter>
                <span>3 entries</span>
                <span>Jan – Apr 2026</span>
              </CardFooter>
            </Card>
            <div className="space-y-3">
              <EmptyState
                icon={<Inbox />}
                title="No approved versions yet"
                description="Approve the draft to freeze v1 and compile role views."
                action={<Button size="sm">Go to review</Button>}
              />
              <div className="space-y-2 rounded-lg border border-border p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Data table">
          <DataTable
            fixed
            defaultSort={{ key: "date", dir: "desc" }}
            columns={[
              { key: "grade", header: "Grade", width: "130px", sortable: true },
              { key: "title", header: "Claim", sortable: true },
              { key: "owner", header: "Owner", width: "140px", sortable: true },
              { key: "date", header: "Date", width: "80px", align: "right", sortable: true },
            ]}
            rows={[
              ["VERIFIED", "Auth moved from Firebase to Supabase on 12 Mar", "Meera Kulkarni", "2026-03-12"],
              ["CONFLICTING", "Payment gateway: Razorpay (decided 2 Apr)", "Dev Patil", "2026-04-02"],
              ["INFERRED", "email-templates has a single maintainer: Meera", "Meera Kulkarni", "2026-04-21"],
              ["MISSING", "No record of who holds the production database password", "", ""],
            ].map(([g, t, o, d], i) => ({
              id: String(i),
              sort: { grade: g, title: t, owner: o || null, date: d || null },
              cells: {
                grade: <GradeChip grade={g as (typeof GRADE_ORDER)[number]} />,
                title: <span className="text-text">{t}</span>,
                owner: o ? <span className="flex items-center gap-1.5 text-xs text-muted"><Avatar name={o} size={18} />{o}</span> : <span className="text-subtle">—</span>,
                date: <span className="font-mono text-[11px] text-subtle">{d.slice(5) || "—"}</span>,
              },
            }))}
          />
        </Section>

        <Section title="Interactive: segmented control, dialog, drawer, toast, tooltip, tabs">
          <InteractiveDemos />
        </Section>
      </main>
  );
}
