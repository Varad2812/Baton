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
 * Fills its container's width. Height: 260px (compact: 132px), labels included. The orthographic
 * camera is fitted to the stairs' bounding box on every resize; labels are DOM, placed under each block.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges, Html } from "@react-three/drei";
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
};
export type PipelineStaircaseProps = { stages: StaircaseStage[]; compact?: boolean };

/** Stage colours follow the deck: sources blue, reconstruction violet, verification teal, review + handover amber. */
const STAGE_HEX: Record<string, string> = {
  connect: "#4C7BD9",
  reconstruct: "#7A4FD1",
  verify: "#1F9E89",
  review: "#C98A2E",
  handover: PALETTE.amber,
};
const FALLBACK_HEX = ["#4C7BD9", "#7A4FD1", "#1F9E89", "#C98A2E", PALETTE.amber];

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

function Block({ stage, index, x, compact }: { stage: StaircaseStage; index: number; x: number; compact: boolean }) {
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
    mat.current.emissiveIntensity =
      stage.status === "running" ? (animate ? 0.2 + 0.16 * Math.sin(clock.elapsedTime * 3) : 0.26) : 0;
  });

  const showCount = stage.status === "done" && stage.count !== undefined;
  return (
    <group position={[x, h / 2, 0]}>
      <mesh>
        <boxGeometry args={[W, h, W]} />
        <meshStandardMaterial
          ref={mat}
          color={look.color}
          emissive={look.emissive}
          roughness={0.85}
          metalness={0}
          transparent={look.opacity < 1}
          opacity={look.opacity}
        />
        <Edges color={look.edge} transparent opacity={look.edgeOpacity} />
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

type LabelPos = { x: number; y: number }[];

/**
 * Fits the orthographic camera to the stairs: project every block corner into view space, then
 * pick the zoom and camera offset that centre the bounding box inside the padded canvas. Reports
 * the screen position of each block's front-bottom edge so DOM labels can sit just below it.
 */
function Fit({ xs, pad, onLabels }: { xs: number[]; pad: { top: number; bottom: number; x: number }; onLabels: (p: LabelPos) => void }) {
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
    onLabels(
      xs.map((x) => {
        v.set(x, 0, W / 2).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
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

export default function PipelineStaircase({ stages, compact = false }: PipelineStaircaseProps) {
  const done = stages.filter((s) => s.status === "done").length;
  const running = stages.find((s) => s.status === "running");
  const n = stages.length;
  const xs = useMemo(() => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * STEP), [n]);
  const pad = useMemo(() => (compact ? { top: 10, bottom: 10, x: 12 } : { top: 14, bottom: 44, x: 24 }), [compact]);
  const [labels, setLabels] = useState<LabelPos>([]);
  const sig = stages.map((s) => `${s.key}:${s.status}:${s.count ?? ""}`).join("|");
  return (
    <div className="relative w-full select-none" style={{ height: compact ? STAIRCASE_HEIGHT.compact : STAIRCASE_HEIGHT.full }}>
      <SceneCanvas
        orthographic
        camera={{ position: [10, 10, 10], zoom: 60, near: 0.1, far: 100 }}
        label={`Pipeline progress: ${done} of ${stages.length} stages done${running ? `, ${running.label} running` : ""}.`}
      >
        <StudioLights glow={false} />
        {stages.map((s, i) => (
          <Block key={s.key} stage={s} index={i} x={xs[i]} compact={compact} />
        ))}
        <Fit xs={xs} pad={pad} onLabels={setLabels} />
        <Invalidate sig={sig} />
      </SceneCanvas>
      {compact && (
        <p className="pointer-events-none absolute top-1.5 left-2 font-mono text-[10.5px] text-subtle" aria-hidden>
          {done}/{n} done
          {running && <span className="text-primary"> · {running.label} running</span>}
          {stages.find((s) => s.status === "error") && (
            <span className="text-conflicting"> · {stages.find((s) => s.status === "error")!.label} failed</span>
          )}
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
            const p = labels[i];
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
    </div>
  );
}
