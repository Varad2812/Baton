import type { Grade, SourceKind } from "@/generated/prisma/enums";
import { GRADE_COLOR, KIND_LABEL } from "@/lib/views/format";

type Node = { id: string; grade: Grade; sources: SourceKind[] };

const KINDS: SourceKind[] = ["GITHUB_PR", "GITHUB_ISSUE", "GITHUB_COMMIT", "DOC", "CHAT", "TASKS", "TESTIMONY"];

function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Static evidence constellation (SVG placeholder for the R3F scene). Source kinds sit on an outer ring;
 * each claim is placed near the centroid of the sources that back it, so multi-source (verified) claims
 * gather in the middle and single-source/inferred claims drift outward. MISSING claims have no anchor.
 */
export function Constellation({ nodes, width = 380, height = 300 }: { nodes: Node[]; width?: number; height?: number }) {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) / 2 - 26;
  const anchor = new Map(
    KINDS.map((k, i) => {
      const a = (i / KINDS.length) * Math.PI * 2 - Math.PI / 2;
      return [k, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a }];
    }),
  );
  const placed = nodes.map((n) => {
    const r1 = rand(n.id);
    const r2 = rand(n.id + "y");
    if (n.sources.length === 0) {
      const a = r1 * Math.PI * 2;
      return { ...n, x: cx + Math.cos(a) * (R + 12), y: cy + Math.sin(a) * (R + 12) };
    }
    const pts = n.sources.map((s) => anchor.get(s)!).filter(Boolean);
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const pull = pts.length > 1 ? 0.55 : 0.72;
    return {
      ...n,
      x: cx + (mx - cx) * pull + (r1 - 0.5) * 34,
      y: cy + (my - cy) * pull + (r2 - 0.5) * 34,
    };
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img"
      aria-label={`Evidence constellation: ${nodes.length} claims linked to ${KINDS.length} source kinds`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeDasharray="2 4" />
      <circle cx={cx} cy={cy} r={R * 0.45} fill="none" stroke="var(--border)" strokeOpacity={0.5} />
      {placed.map((n) =>
        n.sources.map((s) => {
          const a = anchor.get(s);
          if (!a) return null;
          return (
            <line key={n.id + s} x1={n.x} y1={n.y} x2={a.x} y2={a.y} stroke={GRADE_COLOR[n.grade]} strokeOpacity={0.13} strokeWidth={0.75} />
          );
        }),
      )}
      {placed.map((n) => (
        <circle
          key={n.id}
          cx={n.x}
          cy={n.y}
          r={n.grade === "VERIFIED" ? 3.2 : 2.6}
          fill={n.grade === "MISSING" ? "var(--surface)" : GRADE_COLOR[n.grade]}
          stroke={n.grade === "MISSING" ? GRADE_COLOR.MISSING : "none"}
          strokeDasharray={n.grade === "MISSING" ? "1.5 1.5" : undefined}
        >
          <title>{n.id}</title>
        </circle>
      ))}
      {KINDS.map((k) => {
        const a = anchor.get(k)!;
        const lx = cx + Math.cos(a.a) * (R + 4);
        const ly = cy + Math.sin(a.a) * (R + 4);
        return (
          <g key={k}>
            <rect x={a.x - 4} y={a.y - 4} width={8} height={8} rx={1.5} fill="var(--surface-2)" stroke="var(--muted)" />
            <text
              x={lx + (Math.cos(a.a) > 0.2 ? 8 : Math.cos(a.a) < -0.2 ? -8 : 0)}
              y={ly + (Math.sin(a.a) > 0.5 ? 14 : Math.sin(a.a) < -0.5 ? -8 : 3)}
              fontSize="9.5"
              fill="var(--subtle)"
              textAnchor={Math.cos(a.a) > 0.2 ? "start" : Math.cos(a.a) < -0.2 ? "end" : "middle"}
              fontFamily="var(--font-inter)"
            >
              {KIND_LABEL[k]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
