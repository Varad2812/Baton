"use client";

/**
 * PipelineStaircase: five isometric blocks rising like stairs, one per pipeline phase.
 * idle = dark matte block; running = amber edges + slow pulse; done = filled with the stage
 * colour, count printed on the front face; error = red.
 *
 * Usage (import the lazy wrapper so three.js stays out of the main bundle):
 *
 *   import { LazyPipelineStaircase } from "@/components/three/lazy";
 *
 *   <LazyPipelineStaircase
 *     stages={[
 *       { key: "connect", label: "Connect", status: "done", count: 40, unit: "sources" },
 *       { key: "reconstruct", label: "Reconstruct", status: "done", count: 67, unit: "claims" },
 *       { key: "verify", label: "Verify", status: "running" },
 *       { key: "review", label: "Review", status: "idle" },
 *       { key: "handover", label: "Handover", status: "idle" },
 *     ]}
 *     compact={false}
 *   />
 *
 * Interaction: hover or focus a block for a "what happens here" tooltip (plain English + count); click or press
 * Enter to call `onStageClick(key)`. The running block pulses and shows a progress ring (pass `progress` 0..1 for a
 * determinate ring, otherwise it loops); done blocks get a check. Full mode adds a caption under the scene that
 * follows the active stage.
 *
 * Fills its container's width. Height: 260px (compact: 132px), labels included. The orthographic
 * camera is fitted to the stairs' bounding box on every resize; labels are DOM, placed under each block.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges, Html } from "@react-three/drei";
import { Check, X } from "lucide-react";
import { PALETTE, SceneCanvas, StudioLights, useSceneMotion } from "./shared";
import { STAIRCASE_HEIGHT } from "./constants";

export type StageStatus = "idle" | "running" | "done" | "error";
export type StaircaseStage = {
  key: string;
  label: string;
  status: StageStatus;
  count?: number;
  /** Optional unit shown under the label, e.g. "claims". */
  unit?: string;
  /** Override the fill colour used when done. */
  color?: string;
  /** 0..1 fill of the progress ring while running; omit for a looping ring. */
  progress?: number;
  /** Override the plain-English "what happens here" text. */
  description?: string;
};
export type PipelineStaircaseProps = {
  stages: StaircaseStage[];
  compact?: boolean;
  /** Called when a block is clicked (or activated with the keyboard). */
  onStageClick?: (key: string) => void;
};

/** Stage colours follow the deck: sources blue, reconstruction violet, verification teal, review + handover amber. */
const STAGE_HEX: Record<string, string> = {
  connect: "#4C7BD9",
  reconstruct: "#7A4FD1",
  verify: "#1F9E89",
  review: "#C98A2E",
  handover: PALETTE.amber,
};
const FALLBACK_HEX = ["#4C7BD9", "#7A4FD1", "#1F9E89", "#C98A2E", PALETTE.amber];

/** Plain-English copy per stage key: `what` for the hover tooltip, `live` for the caption while it runs. */
const HELP: Record<string, { what: string; live: string }> = {
  connect: {
    what: "Baton reads the repo, chat export, notes and task board you authorise, labels each Public, Team or Restricted, and redacts secrets, emails and phone numbers before anything is analysed.",
    live: "Reading your sources and redacting secrets and personal details before any analysis.",
  },
  reconstruct: {
    what: "Decisions, tasks, risks, owners and contacts are extracted as claims. Each one must point at the exact words it came from.",
    live: "Extracting decisions, tasks and risks, each tied to a quoted passage.",
  },
  verify: {
    what: "Every quote is string-matched against the real source text, then graded Verified, Single source, Inferred, Conflicting or Missing. Contradictions are flagged.",
    live: "Checking every quote against the source text and grading each claim.",
  },
  review: {
    what: "A reviewer edits or rejects claims, resolves conflicts and approves a version. Approval is immutable and the owner cannot approve their own handover.",
    live: "Waiting on a reviewer to resolve conflicts and approve a version.",
  },
  handover: {
    what: "The approved version is compiled per role, so the successor only sees what they are allowed to see, with a 7-day and 30-day plan.",
    live: "Compiling a role-safe handover and plan for the successor.",
  },
};
const helpFor = (s: StaircaseStage) => ({
  what: s.description ?? HELP[s.key]?.what ?? `${s.label}: one phase of the pipeline.`,
  live: HELP[s.key]?.live ?? `${s.label} is running.`,
});

const W = 1;
const H0 = 0.42;
const DH = 0.34;
const STEP = 1.6;
// Camera from the front-left, so +x climbs up and to the right on screen like a staircase.
const YAW = -0.5;
const PITCH = 0.52;

function fill(stage: StaircaseStage, i: number) {
  return stage.color ?? STAGE_HEX[stage.key] ?? FALLBACK_HEX[i % FALLBACK_HEX.length];
}

function Block({
  stage,
  index,
  x,
  compact,
  hovered,
}: {
  stage: StaircaseStage;
  index: number;
  x: number;
  compact: boolean;
  hovered: boolean;
}) {
  const { animate } = useSceneMotion();
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const h = H0 + index * DH;
  const look = useMemo(() => {
    switch (stage.status) {
      case "done":
        return { color: fill(stage, index), edge: "#ffffff", edgeOpacity: 0.42, opacity: 1, emissive: "#000000" };
      case "running":
        return { color: PALETTE.surface2, edge: PALETTE.amber, edgeOpacity: 1, opacity: 0.9, emissive: PALETTE.amber };
      case "error":
        return { color: PALETTE.conflicting, edge: "#ffb3ad", edgeOpacity: 0.7, opacity: 1, emissive: "#000000" };
      default:
        return { color: "#1C2132", edge: "#ffffff", edgeOpacity: 0.22, opacity: 0.8, emissive: "#000000" };
    }
  }, [stage, index]);

  useFrame(({ clock }) => {
    if (!mat.current) return;
    const base = stage.status === "running" ? (animate ? 0.2 + 0.16 * Math.sin(clock.elapsedTime * 3) : 0.26) : 0;
    mat.current.emissiveIntensity = base + (hovered ? 0.18 : 0);
  });

  const showCount = stage.status === "done" && stage.count !== undefined;
  return (
    <group position={[x, h / 2, 0]}>
      <mesh>
        <boxGeometry args={[W, h, W]} />
        <meshStandardMaterial
          ref={mat}
          color={look.color}
          emissive={hovered && look.emissive === "#000000" ? "#ffffff" : look.emissive}
          roughness={0.85}
          metalness={0}
          transparent={look.opacity < 1}
          opacity={look.opacity}
        />
        <Edges color={hovered ? PALETTE.text : look.edge} transparent opacity={hovered ? 1 : look.edgeOpacity} />
      </mesh>
      {showCount && (
        // CSS3D-transformed onto the front (+z) face so it reads as printed on the block.
        <Html transform position={[0, h / 2 - (compact ? 0.24 : 0.27), W / 2 + 0.002]} distanceFactor={10} style={{ pointerEvents: "none" }}>
          <span className="block font-mono text-[15px] leading-none font-semibold tabular-nums text-white select-none">{stage.count}</span>
        </Html>
      )}
    </group>
  );
}

/** Screen geometry per block, in canvas pixels: bounding rect, top-face centre, and front-bottom edge. */
type BlockPos = { l: number; r: number; t: number; b: number; cx: number; cy: number; x: number; y: number };

/**
 * Fits the orthographic camera to the stairs: project every block corner into view space, then
 * pick the zoom and camera offset that centre the bounding box inside the padded canvas. Reports
 * each block's screen rect so DOM labels, hit areas, markers and tooltips can sit on it.
 */
function Fit({ xs, pad, onLabels }: { xs: number[]; pad: { top: number; bottom: number; x: number }; onLabels: (p: BlockPos[]) => void }) {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const camera = get().camera as THREE.OrthographicCamera;
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
    camera.position.copy(dir).multiplyScalar(30);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse;
    const box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
    const v = new THREE.Vector3();
    xs.forEach((x, i) => {
      const h = H0 + i * DH;
      for (const cx of [-W / 2, W / 2]) for (const cy of [0, h]) for (const cz of [-W / 2, W / 2]) {
        v.set(x + cx, cy, cz).applyMatrix4(view);
        box.expandByPoint(new THREE.Vector2(v.x, v.y));
      }
    });
    const bw = box.max.x - box.min.x;
    const bh = box.max.y - box.min.y;
    const zoom = Math.max(1, Math.min((size.width - pad.x * 2) / bw, (size.height - pad.top - pad.bottom) / bh));
    // Shift the camera so the box centre lands in the middle of the padded area.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2 + (pad.top - pad.bottom) / 2 / zoom;
    camera.position.addScaledVector(right, cx).addScaledVector(up, cy);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const px = (p: THREE.Vector3) => ({ x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height });
    onLabels(
      xs.map((x, i) => {
        const h = H0 + i * DH;
        let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        for (const dx of [-W / 2, W / 2]) for (const dy of [0, h]) for (const dz of [-W / 2, W / 2]) {
          const q = px(v.set(x + dx, dy, dz).project(camera));
          l = Math.min(l, q.x); r = Math.max(r, q.x); t = Math.min(t, q.y); b = Math.max(b, q.y);
        }
        const top = px(v.set(x, h, 0).project(camera));
        const front = px(v.set(x, 0, W / 2).project(camera));
        return { l, r, t, b, cx: top.x, cy: top.y, x: front.x, y: front.y };
      }),
    );
    invalidate();
  }, [size.width, size.height, xs, pad.top, pad.bottom, pad.x, get, invalidate, onLabels]);
  return null;
}

function Invalidate({ sig }: { sig: string }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [sig, invalidate]);
  return null;
}

function statusLine(s: StaircaseStage) {
  if (s.status === "running") return "in progress";
  if (s.status === "error") return "failed";
  if (s.status === "done") return s.count !== undefined && s.unit ? `${s.count} ${s.unit}` : "done";
  return "waiting";
}

const RING_C = 2 * Math.PI * 10;

/** Status marker on a block's top face: progress ring while running, check when done, "x" on error. */
function Marker({ stage, pos, compact }: { stage: StaircaseStage; pos: BlockPos; compact: boolean }) {
  if (stage.status === "idle") return null;
  const size = compact ? 18 : 26;
  const style = { left: pos.cx, top: pos.cy, width: size, height: size, transform: "translate(-50%, -55%)" } as const;
  if (stage.status === "running") {
    const determinate = stage.progress !== undefined;
    return (
      <svg className="pointer-events-none absolute" style={style} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#0B0D15" fillOpacity="0.75" stroke={PALETTE.subtle} strokeOpacity="0.8" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke={PALETTE.amber}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={determinate ? RING_C * (1 - Math.min(1, Math.max(0, stage.progress!))) : RING_C * 0.4}
          transform="rotate(-90 12 12)"
          className={determinate ? "transition-[stroke-dashoffset] duration-300" : "baton-ring"}
        />
      </svg>
    );
  }
  const err = stage.status === "error";
  return (
    <span
      className="pointer-events-none absolute flex items-center justify-center rounded-full text-white shadow-sm shadow-black/40"
      style={{ ...style, background: err ? PALETTE.conflicting : "rgba(11,13,21,0.72)", border: `1px solid ${err ? "#ffb3ad" : "rgba(255,255,255,0.45)"}` }}
      aria-hidden
    >
      {err ? <X style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={3} /> : <Check style={{ width: size * 0.58, height: size * 0.58 }} strokeWidth={3.2} />}
    </span>
  );
}

const TIP_W = 232;

export default function PipelineStaircase({ stages, compact = false, onStageClick }: PipelineStaircaseProps) {
  const done = stages.filter((s) => s.status === "done").length;
  const running = stages.find((s) => s.status === "running");
  const failed = stages.find((s) => s.status === "error");
  const n = stages.length;
  const xs = useMemo(() => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * STEP), [n]);
  const pad = useMemo(() => (compact ? { top: 10, bottom: 10, x: 12 } : { top: 14, bottom: 62, x: 24 }), [compact]);
  const [pos, setPos] = useState<BlockPos[]>([]);
  const [hover, setHover] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootW, setRootW] = useState(600);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRootW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sig = stages.map((s) => `${s.key}:${s.status}:${s.count ?? ""}`).join("|");
  const height = compact ? STAIRCASE_HEIGHT.compact : STAIRCASE_HEIGHT.full;

  const hovered = hover >= 0 ? stages[hover] : undefined;
  const hp = hover >= 0 ? pos[hover] : undefined;

  // Caption: follows the running stage; otherwise says what is next or that the run is complete.
  const nextIdle = stages.find((s) => s.status === "idle");
  const caption = running
    ? { head: running.label, text: helpFor(running).live, tone: "text-primary" }
    : failed
      ? { head: `${failed.label} failed`, text: "The run stopped here. Open the stage to see the error, then retry.", tone: "text-conflicting" }
      : done === n && n > 0
        ? { head: "Complete", text: "Every stage has run. Hover a block to see what it did.", tone: "text-verified" }
        : nextIdle
          ? { head: done ? `Next: ${nextIdle.label}` : "Not started", text: done ? helpFor(nextIdle).live : "Run the pipeline to build the stairs, or hover a block to see what each stage does.", tone: "text-muted" }
          : null;

  return (
    <div ref={rootRef} className="relative w-full select-none" style={{ height }}>
      <style>{`.baton-ring{animation:baton-ring-fill 2.2s ease-in-out infinite}@keyframes baton-ring-fill{0%{stroke-dashoffset:${RING_C}}100%{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.baton-ring{animation:none}}`}</style>
      <SceneCanvas
        orthographic
        camera={{ position: [10, 10, 10], zoom: 60, near: 0.1, far: 100 }}
        label={`Pipeline progress: ${done} of ${stages.length} stages done${running ? `, ${running.label} running` : ""}.`}
      >
        <StudioLights glow={false} />
        {stages.map((s, i) => (
          <Block key={s.key} stage={s} index={i} x={xs[i]} compact={compact} hovered={hover === i} />
        ))}
        <Fit xs={xs} pad={pad} onLabels={setPos} />
        <Invalidate sig={`${sig}#${hover}`} />
      </SceneCanvas>

      {pos.length === n && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {stages.map((s, i) => (
            <Marker key={s.key} stage={s} pos={pos[i]} compact={compact} />
          ))}
        </div>
      )}

      {compact && (
        <p className="pointer-events-none absolute top-1.5 left-2 font-mono text-[10.5px] text-subtle" aria-hidden>
          {done}/{n} done
          {running && <span className="text-primary"> · {running.label} running</span>}
          {failed && <span className="text-conflicting"> · {failed.label} failed</span>}
        </p>
      )}

      {compact ? (
        <ol className="sr-only" aria-live="polite">
          {stages.map((s) => (
            <li key={s.key}>
              {s.label}: {statusLine(s)}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="pointer-events-none absolute inset-0" aria-live="polite">
          {stages.map((s, i) => {
            const p = pos[i];
            if (!p) return null;
            return (
              <li
                key={s.key}
                className="absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
                style={{ left: p.x, top: p.y + 8 }}
              >
                <span
                  className={
                    "text-[12.5px] leading-tight font-medium " +
                    (s.status === "running" ? "text-primary" : s.status === "idle" ? "text-muted" : s.status === "error" ? "text-conflicting" : "text-text")
                  }
                >
                  {s.label}
                </span>
                <span className="font-mono text-[10.5px] leading-tight text-subtle">{statusLine(s)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Hit areas: real buttons over each block, so hover, focus and click work for mouse and keyboard. */}
      {pos.length === n &&
        stages.map((s, i) => {
          const p = pos[i];
          return (
            <button
              key={s.key}
              type="button"
              aria-label={`${s.label}, ${statusLine(s)}. ${helpFor(s).what}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? -1 : h))}
              onClick={() => onStageClick?.(s.key)}
              className="absolute rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              style={{
                left: p.l,
                top: p.t,
                width: p.r - p.l,
                height: compact ? p.b - p.t : p.b - p.t + 34,
                cursor: onStageClick ? "pointer" : "default",
              }}
            />
          );
        })}

      {hovered && hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface-2 px-3 py-2 shadow-lg shadow-black/40"
          style={{
            width: TIP_W,
            left: Math.min(Math.max(hp.cx - TIP_W / 2, 4), Math.max(4, rootW - TIP_W - 4)),
            // Anchor above the block; on tall blocks there is no room, so sit at the top edge.
            top: Math.max(4, hp.t - (compact ? 112 : 124)),
          }}
          role="tooltip"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-medium text-text">{hovered.label}</span>
            <span className="font-mono text-[10.5px] text-muted tabular-nums">
              {hovered.status === "done" && hovered.count !== undefined ? `${hovered.count}${hovered.unit ? ` ${hovered.unit}` : ""}` : statusLine(hovered)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-wide text-subtle uppercase">What happens here</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{helpFor(hovered).what}</p>
          {onStageClick && <p className="mt-1 font-mono text-[10px] text-subtle">Click to open</p>}
        </div>
      )}

      {!compact && caption && (
        <p className="pointer-events-none absolute inset-x-3 bottom-1.5 truncate text-center text-[12px] leading-tight text-muted" aria-hidden>
          <span className={`font-medium ${caption.tone}`}>{caption.head}</span>
          <span className="text-subtle"> · </span>
          {caption.text}
        </p>
      )}
    </div>
  );
}
