"use client";

/**
 * HeroStack: the landing page scene. Four translucent source layers (GitHub, Chat, Notes, Tasks)
 * stacked with gaps; evidence particles rise out of each layer into the amber "Approved handover"
 * slab on top, where graded claims settle as small cubes. It is the product in one picture:
 * scattered records in, one approved, graded handover out.
 *
 * Usage (client only, via the lazy wrapper):
 *   <LazyHeroStack layers={[{ key: "github", label: "GitHub", sub: "12 PRs · 15 issues" }, ...]}
 *                  grades={{ VERIFIED: 32, SINGLE_SOURCE: 17, INFERRED: 6, CONFLICTING: 6, MISSING: 6 }} />
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import { GRADE_HEX, PALETTE, SceneCanvas, StudioLights, useSceneMotion, type GradeKey } from "./shared";

export type HeroLayer = { key: string; label: string; sub?: string; color: string };
export type HeroStackProps = {
  layers?: HeroLayer[];
  /** Grade distribution used to colour the settling cubes (proportional). */
  grades?: Partial<Record<GradeKey, number>>;
  approvedLabel?: string;
  approvedSub?: string;
};

export const DEFAULT_LAYERS: HeroLayer[] = [
  { key: "github", label: "GitHub", sub: "commits · PRs · issues", color: "#4C7BD9" },
  { key: "chat", label: "Chat", sub: "#dev · #payments · #general", color: "#7A4FD1" },
  { key: "notes", label: "Notes", sub: "README · meeting notes", color: "#1F9E89" },
  { key: "tasks", label: "Tasks", sub: "Trello board", color: "#8A8FA3" },
];

const SLAB = 2.5;
const SLAB_H = 0.14;
const GAP = 0.78;
const TOP_Y = DEFAULT_LAYERS.length * GAP + 0.35;
const GRID = 6;
const CELL = 0.3;
const CUBE = 0.2;
const DROP_EVERY = 0.32;
const HOLD = 3.2;

// Label anchor: to the screen-right of the stack (camera looks from +x,+z; screen-right is +x,-z).
const LABEL_DIR = new THREE.Vector3(1, 0, -1).normalize().multiplyScalar(1.85);

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function cubeColours(grades: Partial<Record<GradeKey, number>> | undefined, n: number) {
  const g: Record<GradeKey, number> = {
    VERIFIED: 32,
    SINGLE_SOURCE: 17,
    INFERRED: 6,
    CONFLICTING: 6,
    MISSING: 6,
    ...grades,
  };
  const total = Object.values(g).reduce((s, v) => s + v, 0) || 1;
  const out: string[] = [];
  (Object.keys(g) as GradeKey[]).forEach((k) => {
    const c = Math.round((g[k] / total) * n);
    for (let i = 0; i < c && out.length < n; i++) out.push(GRADE_HEX[k]);
  });
  while (out.length < n) out.push(GRADE_HEX.VERIFIED);
  // Deterministic shuffle so colours are spread, not banded.
  return out
    .map((c, i) => ({ c, k: hash(i + 3) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
}

function glowTexture() {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type LabelSpec = { key: string; y: number; title: string; short?: string; sub?: string; color: string; strong?: boolean };

/**
 * Plain DOM labels over the canvas. Each frame, LabelTracker projects the label anchors (in the
 * Frame group's space, so they follow its responsive offset/scale but not the spin) and writes the
 * pixel position straight to the element: no React re-render, and no per-label portal roots.
 */
function LabelOverlay({ labels, refs }: { labels: LabelSpec[]; refs: React.RefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {labels.map((l, i) => (
        <div
          key={l.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute top-0 left-0 flex items-center gap-2 whitespace-nowrap opacity-0 transition-opacity duration-200 select-none"
        >
          <span className="h-px w-5" style={{ background: l.color, opacity: 0.7 }} />
          <span className="flex flex-col leading-tight">
            <span className={l.strong ? "text-[13px] font-medium text-primary" : "text-[12px] font-medium text-text"}>
              {l.short ? (
                <>
                  <span className="max-sm:hidden">{l.title}</span>
                  <span className="sm:hidden">{l.short}</span>
                </>
              ) : (
                l.title
              )}
            </span>
            {l.sub && <span className="font-mono text-[10.5px] text-subtle max-sm:hidden">{l.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function LabelTracker({ labels, refs, frame }: { labels: LabelSpec[]; refs: React.RefObject<(HTMLDivElement | null)[]>; frame: React.RefObject<THREE.Group | null> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = frame.current;
    if (!g) return;
    // Matrices are normally refreshed during render, after useFrame; refresh now so the very first
    // (and, under reduced motion, only) frame already places labels correctly.
    g.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    labels.forEach((l, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(LABEL_DIR.x, l.y, LABEL_DIR.z).applyMatrix4(g.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translateY(-50%)`;
      el.style.opacity = "1";
    });
  });
  return null;
}

function Slab({ y, color, opacity, edge }: { y: number; color: string; opacity: number; edge: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[SLAB, SLAB_H, SLAB]} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0} transparent opacity={opacity} depthWrite={false} />
      <Edges color="#ffffff" transparent opacity={edge} />
    </mesh>
  );
}

const PARTICLES = 72;

function Particles({ layers }: { layers: HeroLayer[] }) {
  const { animate } = useSceneMotion();
  const tex = useMemo(() => glowTexture(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => ({
        layer: i % layers.length,
        x: (hash(i * 7.3) - 0.5) * (SLAB - 0.5),
        z: (hash(i * 3.1 + 9) - 0.5) * (SLAB - 0.5),
        speed: 0.28 + hash(i * 1.7) * 0.22,
        offset: hash(i * 5.9),
      })),
    [layers.length],
  );
  const ref = useRef<THREE.Points>(null);
  const buffers = useMemo(() => [new Float32Array(PARTICLES * 3), new Float32Array(PARTICLES * 3)] as const, []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const cols = useMemo(() => layers.map((l) => new THREE.Color(l.color)), [layers]);
  const amber = useMemo(() => new THREE.Color(PALETTE.amber), []);

  const place = (t: number) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    seeds.forEach((s, i) => {
      const y0 = s.layer * GAP + SLAB_H;
      const y1 = TOP_Y - SLAB_H;
      const span = y1 - y0;
      const p = (s.offset + (t * s.speed) / span) % 1;
      // Converge toward the centre as they rise: many records, one handover.
      const pull = 1 - p * 0.55;
      pos.setXYZ(i, s.x * pull, y0 + p * span, s.z * pull);
      tmp.copy(cols[s.layer]).lerp(amber, p * p);
      const fade = Math.min(1, p * 6) * Math.min(1, (1 - p) * 5);
      col.setXYZ(i, tmp.r * fade, tmp.g * fade, tmp.b * fade);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  useLayoutEffect(() => place(4.2)); // static pose for the first (or only) frame
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime + 4.2);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers[0], 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers[1], 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        size={0.2}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function SettlingCubes({ grades }: { grades?: Partial<Record<GradeKey, number>> }) {
  const { animate } = useSceneMotion();
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = GRID * GRID;
  const colours = useMemo(() => cubeColours(grades, n), [grades, n]);
  // Fill order spirals in loosely from the centre so the slab looks like it is being assembled.
  const order = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => i).sort((a, b) => {
        const da = Math.hypot((a % GRID) - 2.5, Math.floor(a / GRID) - 2.5) + hash(a) * 0.9;
        const db = Math.hypot((b % GRID) - 2.5, Math.floor(b / GRID) - 2.5) + hash(b) * 0.9;
        return da - db;
      }),
    [n],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cycle = n * DROP_EVERY + HOLD + 0.9;

  const pose = (t: number, settled: boolean) => {
    const mesh = ref.current;
    if (!mesh) return;
    const tc = t % cycle;
    const clearing = tc > n * DROP_EVERY + HOLD; // all cubes sink away together, then refill
    order.forEach((cell, k) => {
      const gx = (cell % GRID) - (GRID - 1) / 2;
      const gz = Math.floor(cell / GRID) - (GRID - 1) / 2;
      const restY = TOP_Y + SLAB_H / 2 + CUBE / 2 + 0.005;
      let y = restY;
      let s = 1;
      if (!settled) {
        const local = tc - k * DROP_EVERY;
        if (clearing) {
          const c = (tc - (n * DROP_EVERY + HOLD)) / 0.9;
          s = Math.max(0.001, 1 - c);
        } else if (local < 0) {
          s = 0.001;
        } else if (local < 0.55) {
          const p = local / 0.55;
          const ease = 1 - Math.pow(1 - p, 3);
          y = restY + (1 - ease) * 0.9;
          s = 0.4 + 0.6 * ease;
        }
      }
      dummy.position.set(gx * CELL, y, gz * CELL);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new THREE.Color();
    order.forEach((_, k) => m.setColorAt(k, c.set(colours[k])));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    pose(0, true);
  });
  useFrame(({ clock }) => pose(clock.elapsedTime + 2, !animate));

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <boxGeometry args={[CUBE, CUBE, CUBE]} />
      <meshStandardMaterial roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const { animate } = useSceneMotion();
  const spin = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const { pointer, invalidate } = useThree();
  useFrame((_, dt) => {
    if (!animate || !spin.current || !tilt.current) return;
    spin.current.rotation.y += dt * 0.12;
    // Gentle parallax: tilt toward the pointer, eased.
    tilt.current.rotation.x = THREE.MathUtils.lerp(tilt.current.rotation.x, -pointer.y * 0.06, 0.05);
    tilt.current.rotation.z = THREE.MathUtils.lerp(tilt.current.rotation.z, pointer.x * 0.05, 0.05);
  });
  useEffect(() => invalidate(), [animate, invalidate]);
  return (
    <group ref={tilt}>
      <group ref={spin} rotation={[0, 0.25, 0]}>
        {children}
      </group>
    </group>
  );
}

/** Shifts the stack left (and shrinks it on narrow canvases) so the right-hand labels always fit. */
function Frame({ children, groupRef }: { children: React.ReactNode; groupRef: React.RefObject<THREE.Group | null> }) {
  const width = useThree((s) => s.size.width);
  const narrow = width < 560;
  const shift = narrow ? 0.45 : 0.6;
  return (
    <group ref={groupRef} position={[-shift, narrow ? -1.15 : -1.85, shift]} scale={narrow ? 0.66 : 1}>
      {children}
    </group>
  );
}

export default function HeroStack({ layers = DEFAULT_LAYERS, grades, approvedLabel = "Approved handover", approvedSub }: HeroStackProps) {
  const ls = layers.slice(0, 4);
  const frame = useRef<THREE.Group>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labels: LabelSpec[] = [
    ...ls.map((l, i) => ({ key: l.key, y: i * GAP, title: l.label, sub: l.sub, color: l.color })),
    { key: "approved", y: TOP_Y + 0.12, title: approvedLabel, short: "Approved", sub: approvedSub, color: PALETTE.amber, strong: true },
  ];
  return (
    <div className="relative h-full w-full">
      <SceneCanvas
        camera={{ position: [7.2, 6.1, 7.2], fov: 26, near: 0.1, far: 60 }}
        label={`Diagram: ${ls.map((l) => l.label).join(", ")} records rise into one approved handover, graded claim by claim.`}
      >
        <StudioLights />
        <Frame groupRef={frame}>
          <Rig>
            {ls.map((l, i) => (
              <Slab key={l.key} y={i * GAP} color={l.color} opacity={0.42} edge={0.32} />
            ))}
            <Slab y={TOP_Y} color={PALETTE.amber} opacity={0.62} edge={0.55} />
            <Particles layers={ls} />
            <SettlingCubes grades={grades} />
          </Rig>
        </Frame>
        <LabelTracker labels={labels} refs={labelRefs} frame={frame} />
      </SceneCanvas>
      <LabelOverlay labels={labels} refs={labelRefs} />
    </div>
  );
}
