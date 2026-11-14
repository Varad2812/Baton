import { Avatar } from "@/components/ui/avatar";
import { fmtDateTime } from "@/lib/views/format";

type AuditRow = {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: unknown;
  at: Date;
};

export function describeAudit(a: AuditRow): string {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  switch (a.action) {
    case "project.create":
      return "created the project";
    case "source.connect":
      return m.via === "github"
        ? `connected GitHub ${m.repo ?? ""} (${m.items ?? "?"} items)`
        : `uploaded ${m.file ?? `${m.files ?? ""} files`}`;
    case "source.label":
      return `labelled ${a.targetId} as ${String(m.access ?? "").toLowerCase()}`;
    case "pipeline.run":
      return `ran the pipeline (${String(m.mode ?? "").toLowerCase()})`;
    case "interview.answer":
      return `answered gap question ${a.targetId}`;
    case "handover.submit":
      return "submitted the handover for review";
    case "claim.edit":
      return `edited ${a.targetId}${m.field ? ` (${m.field})` : ""}`;
    case "claim.reject":
      return `rejected ${a.targetId}`;
    case "demo.reset":
      return "reset the demo to the seed";
    case "version.approve":
      return `approved handover version${m.number ? ` v${m.number}` : ""}`;
    case "section.acknowledge":
      return `acknowledged ${m.section ? `“${m.section}”` : "a section"}`;
    case "followup.create":
      return "asked a follow-up question";
    case "followup.answer":
      return "answered a follow-up question";
    case "conflict.resolve":
      return `resolved ${a.targetId ?? "a conflict"}${m.resolution ? ` (kept ${String(m.resolution).toLowerCase()})` : ""}`;
    case "access.requested":
      return "requested access to hidden claims";
    case "trust.leakage_test":
      return "ran the canary leakage test";
    case "trust.recheck_quotes":
      return "re-checked every quote against its chunk";
    default: {
      const verb = a.action.replace(/[._]/g, " ");
      const id = a.targetId && a.targetId.length < 24 ? ` ${a.targetId}` : "";
      return `${verb}${id}`;
    }
  }
}

export function AuditList({ rows, compact = false }: { rows: AuditRow[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-border/70">
      {rows.map((a) => (
        <li key={a.id} className={compact ? "flex items-center gap-2.5 px-4 py-2" : "flex items-center gap-3 px-4 py-2.5"}>
          <Avatar name={a.actorName} size={22} />
          <div className="min-w-0 flex-1 truncate text-[13px]">
            <span className="font-medium text-text">{a.actorName}</span>{" "}
            <span className="text-muted">{describeAudit(a)}</span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-subtle">{fmtDateTime(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}
