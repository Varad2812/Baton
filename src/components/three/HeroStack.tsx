"use client";

/**
 * HeroStack: the landing page scene. Four translucent source layers (GitHub, Chat, Notes, Tasks)
 * stacked with gaps; evidence particles rise out of each layer into the amber "Approved handover"
 * slab on top, where graded claims settle as small cubes. It is the product in one picture:
 * scattered records in, one approved, graded handover out.
 *
 * Interaction (all optional, nothing is required to understand the picture):
 *  - drag to rotate (damped, limited tilt, no zoom/pan); auto-rotate resumes 3 s after the last drag
 *  - hover a layer: it lifts and glows, a card says what that source is for
 *  - click a layer: it slides out and its evidence flows into the approved slab, with a caption
 *    saying what Baton extracts from it (click again, or empty space, to clear)
 *  - "Play how it works": a 10 s scripted tour (stack, extract, verify, assemble) with captions
 *    (under prefers-reduced-motion it becomes a 4-step "Next" walkthrough with static poses)
 *
 * Usage (client only, via the lazy wrapper):
 *   <LazyHeroStack layers={[{ key: "github", label: "GitHub", sub: "12 PRs · 15 issues" }, ...]}
 *                  grades={{ VERIFIED: 32, SINGLE_SOURCE: 17, INFERRED: 6, CONFLICTING: 6, MISSING: 6 }} />
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import { Check, Play, RotateCcw, SkipForward, Square } from "lucide-react";
import { GRADE_HEX, PALETTE, SceneCanvas, StudioLights, usePrefersReducedMotion, useSceneMotion, type GradeKey } from "./shared";

export type HeroLayer = {
  key: string;
  label: string;
  sub?: string;
  color: string;
  /** Hover card text: what this source is and why it matters. Defaults by key. */
  blurb?: string;
  /** Click caption: what Baton extracts from this source. Defaults by key. */
  extracts?: string;
};
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

const COPY: Record<string, { blurb: string; extracts: string }> = {
  github: {
    blurb: "Commits, PRs, issues: where decisions get made.",
    extracts: "Baton extracts decisions, who owns which service, and recurring build problems, each with the PR or issue it came from.",
  },
  chat: {
    blurb: "Discord and Slack threads: the context that never reached the docs.",
    extracts: "Baton extracts late changes of plan, open questions and vendor chatter, quoted message by message.",
  },
  notes: {
    blurb: "README and meeting notes: what the team agreed in writing.",
    extracts: "Baton extracts final decisions, deadlines and owners from notes, treating approved notes as authoritative.",
  },
  tasks: {
    blurb: "The task board: what is still open and who holds it.",
    extracts: "Baton extracts open work, owners and due dates, then flags cards nobody has touched.",
  },
};
const APPROVED_COPY = {
  blurb: "One reviewed handover: every claim graded and quoted, compiled per role.",
  extracts: "This is what the successor receives: graded claims, resolved conflicts and a 7/30-day plan.",
};

const SLAB = 2.5;
const SLAB_H = 0.14;
const GAP = 0.78;
const N_LAYERS = 4;
const TOP_Y = N_LAYERS * GAP + 0.35;
const GRID = 6;
const CELL = 0.3;
const CUBE = 0.2;
const DROP_EVERY = 0.32;
const HOLD = 3.2;
const LIFT = 0.14;
const SLIDE = 1.15;

const TOUR_SECONDS = 10;
const STAGE_AT = [0, 2.5, 5, 7.5] as const;
const TOUR = [
  { head: "Collect", text: "Sources stack up: the repo, chat, notes and task board, each labelled Public, Team or Restricted." },
  { head: "Extract", text: "Decisions, risks, owners and deadlines are pulled out as claims, each pointing at the exact message or commit." },
  { head: "Verify", text: "Every quote is string-matched against the real source text. No match, no Verified badge." },
  { head: "Hand over", text: "A reviewer approves, and the successor gets one graded handover, compiled for their role." },
] as const;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

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

function tickTexture() {
  const s = 96;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PALETTE.verified;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.52);
  ctx.lineTo(s * 0.44, s * 0.67);
  ctx.lineTo(s * 0.72, s * 0.35);
  ctx.stroke();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Mutable scene state shared between React (events) and the frame loop. Lives in a ref so that a
 * hover or a playing tour never re-renders the Canvas tree; the frame loop eases toward it.
 */
type Sim = {
  hover: number; // 0..N_LAYERS-1 layers, N_LAYERS = approved slab, -1 none
  sel: number; // selected layer, -1 none
  playing: boolean;
  tourT: number; // seconds into the tour (0..TOUR_SECONDS)
  tourStart: number; // performance.now() when the tour began (animated mode)
  cubeOffset: number; // shifts the ambient cube cycle so it resumes "settled" after a tour
  lift: number[];
  glow: number[];
  slide: number[];
  reveal: number[];
  dragging: boolean;
};
const newSim = (): Sim => ({
  hover: -1,
  sel: -1,
  playing: false,
  tourT: 0,
  tourStart: 0,
  cubeOffset: 0,
  lift: Array(N_LAYERS + 1).fill(0),
  glow: Array(N_LAYERS + 1).fill(0),
  slide: Array(N_LAYERS + 1).fill(0),
  reveal: Array(N_LAYERS + 1).fill(1),
  dragging: false,
});

function setCubeOffset(s: Sim, v: number) {
  s.cubeOffset = v;
}

/** Eases lift / glow / slide toward what hover, selection and the tour ask for; reveal follows the tour clock. */
function advanceSim(s: Sim, dt: number, animate: boolean) {
  const k = animate ? 1 - Math.exp(-dt * 11) : 1;
  if (s.playing && animate) s.tourT = Math.min(TOUR_SECONDS, (performance.now() - s.tourStart) / 1000);
  for (let i = 0; i <= N_LAYERS; i++) {
    const hovered = s.hover === i || s.sel === i;
    const lift = hovered ? LIFT : 0;
    const glow = s.sel === i ? 1 : s.hover === i ? 0.7 : s.playing && i === N_LAYERS ? clamp01((s.tourT - 7.4) / 1.2) * 0.8 : 0;
    const slide = s.sel === i && !s.playing ? SLIDE : 0;
    let reveal = 1;
    if (s.playing) reveal = i === N_LAYERS ? clamp01((s.tourT - 2.0) / 0.8) : clamp01((s.tourT - (0.1 + 0.55 * i)) / 0.7);
    s.lift[i] += (lift - s.lift[i]) * k;
    s.glow[i] += (glow - s.glow[i]) * k;
    s.slide[i] += (slide - s.slide[i]) * k;
    s.reveal[i] = reveal;
  }
}

const slabY = (i: number) => (i === N_LAYERS ? TOP_Y : i * GAP);

/** Screen-right direction on the ground plane for the current camera. */
function rightXZ(camera: THREE.Camera, out: THREE.Vector3) {
  out.setFromMatrixColumn(camera.matrixWorld, 0);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  return out.normalize();
}

type LabelSpec = { key: string; title: string; short?: string; sub?: string; color: string; strong?: boolean };

/**
 * Plain DOM labels over the canvas. Each frame the tracker projects each slab's screen-right edge
 * (so the label stays to the right of the stack however it is rotated) and writes the pixel position
 * straight to the element: no React re-render, and no per-label portal roots.
 */
function LabelOverlay({
  labels,
  refs,
  active,
}: {
  labels: LabelSpec[];
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  active: number;
}) {
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
          <span className="h-px w-5" style={{ background: l.color, opacity: active === i ? 1 : 0.7 }} />
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

function LabelTracker({
  labels,
  refs,
  frame,
  sim,
}: {
  labels: LabelSpec[];
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  frame: React.RefObject<THREE.Group | null>;
  sim: React.RefObject<Sim>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const r = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = frame.current;
    if (!g) return;
    // Matrices are normally refreshed during render, after useFrame; refresh now so the very first
    // (and, under reduced motion, only) frame already places labels correctly.
    g.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    rightXZ(camera, r);
    const s = sim.current;
    labels.forEach((l, i) => {
      const el = refs.current[i];
      if (!el) return;
      const reveal = s.reveal[i];
      const y = slabY(i) + s.lift[i];
      // Anchor on the slab's screen-right edge: centre + right * (half-diagonal + slide).
      v.set(0, y, 0).addScaledVector(r, 1.85 + s.slide[i]).applyMatrix4(g.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const py = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${py.toFixed(1)}px, 0) translateY(-50%)`;
      el.style.opacity = reveal < 0.5 ? "0" : s.sel >= 0 && s.sel !== i && i !== N_LAYERS ? "0.35" : "1";
    });
  });
  return null;
}

function Slab({ i, color, base, edge, sim }: { i: number; color: string; base: number; edge: number; sim: React.RefObject<Sim> }) {
  const g = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const edges = useRef<React.ComponentRef<typeof Edges>>(null);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);
  const r = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const s = sim.current;
    const grp = g.current;
    if (!grp || !mat.current) return;
    const reveal = s.reveal[i];
    rightXZ(camera, r);
    const y = slabY(i) + s.lift[i] + (1 - easeOut(reveal)) * 1.3;
    grp.position.set(r.x * s.slide[i], y, r.z * s.slide[i]);
    const glow = s.glow[i];
    mat.current.opacity = Math.min(1, (base + glow * 0.28) * reveal);
    mat.current.emissive.copy(baseColor);
    mat.current.emissiveIntensity = glow * 0.55;
    grp.visible = reveal > 0.01;
    const m = edges.current?.material as THREE.Material | undefined;
    if (m) m.opacity = Math.min(1, (edge + glow * 0.45) * reveal);
  });
  return (
    <group ref={g} position={[0, slabY(i), 0]}>
      <mesh>
        <boxGeometry args={[SLAB, SLAB_H, SLAB]} />
        <meshStandardMaterial ref={mat} color={color} roughness={0.85} metalness={0} transparent opacity={base} depthWrite={false} />
        <Edges ref={edges} color="#ffffff" transparent opacity={edge} />
      </mesh>
    </group>
  );
}

/** Invisible, slightly padded hit boxes: they follow the animated slab so hover is stable while it lifts. */
function HitBoxes({
  sim,
  onHover,
  onPick,
}: {
  sim: React.RefObject<Sim>;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const r = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const s = sim.current;
    rightXZ(camera, r);
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.position.set(r.x * s.slide[i], slabY(i) + s.lift[i], r.z * s.slide[i]);
      m.visible = s.reveal[i] > 0.6;
    });
  });
  return (
    <>
      {Array.from({ length: N_LAYERS + 1 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[0, slabY(i), 0]}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(i);
          }}
          onPointerOut={() => onHover(-1)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.delta > 4) return; // that was a drag, not a click
            onPick(i);
          }}
        >
          <boxGeometry args={[SLAB, 0.42, SLAB]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

const PARTICLES = 72;
const FLOW = 40;

/** Ambient rising particles: layer l's particles rise from its slab into the top slab. */
function Particles({ layers, sim }: { layers: HeroLayer[]; sim: React.RefObject<Sim> }) {
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
  const green = useMemo(() => new THREE.Color(PALETTE.verified), []);
  const r = useMemo(() => new THREE.Vector3(), []);
  const level = useRef(1);

  const place = (t: number, camera: THREE.Camera) => {
    const geo = ref.current?.geometry;
    if (!geo) return;
    const s = sim.current;
    rightXZ(camera, r);
    // During the tour: nothing until the stack is built, then particles, then they turn green.
    const tour = s.playing;
    const target = tour ? clamp01((s.tourT - 2.4) / 0.6) : 1;
    level.current += (target - level.current) * (animate ? 0.12 : 1);
    const tint = tour ? clamp01((s.tourT - 5) / 1.2) : 0;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    seeds.forEach((sd, i) => {
      const y0 = slabY(sd.layer) + SLAB_H + s.lift[sd.layer];
      const y1 = TOP_Y - SLAB_H;
      const span = y1 - y0;
      const p = (sd.offset + (t * sd.speed) / span) % 1;
      // Converge toward the centre as they rise: many records, one handover.
      const pull = 1 - p * 0.55;
      const sl = s.slide[sd.layer] * (1 - p);
      pos.setXYZ(i, sd.x * pull + r.x * sl, y0 + p * span, sd.z * pull + r.z * sl);
      tmp.copy(cols[sd.layer]).lerp(amber, p * p).lerp(green, tint * 0.85);
      // A selected layer's stream is bright; the others fall back so the eye follows one source.
      const emphasis = s.sel < 0 ? 1 : sd.layer === s.sel ? 1.5 : 0.12;
      const fade = Math.min(1, p * 6) * Math.min(1, (1 - p) * 5) * level.current * emphasis * s.reveal[sd.layer];
      col.setXYZ(i, tmp.r * fade, tmp.g * fade, tmp.b * fade);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  useFrame(({ clock, camera }) => place(clock.elapsedTime + 4.2, camera));

  return (
    <points ref={ref} frustumCulled={false}>
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

/** Click flow: a dense stream from the selected slab, along an arc, into the approved slab. */
function Flow({ layers, sim }: { layers: HeroLayer[]; sim: React.RefObject<Sim> }) {
  const { animate } = useSceneMotion();
  const tex = useMemo(() => glowTexture(), []);
  const ref = useRef<THREE.Points>(null);
  const buffers = useMemo(() => [new Float32Array(FLOW * 3), new Float32Array(FLOW * 3)] as const, []);
  const seeds = useMemo(
    () =>
      Array.from({ length: FLOW }, (_, i) => ({
        x: (hash(i * 4.7 + 1) - 0.5) * 0.9,
        z: (hash(i * 2.9 + 5) - 0.5) * 0.9,
        off: i / FLOW,
        wob: hash(i * 8.1),
      })),
    [],
  );
  const cols = useMemo(() => layers.map((l) => new THREE.Color(l.color)), [layers]);
  const amber = useMemo(() => new THREE.Color(PALETTE.amber), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const r = useMemo(() => new THREE.Vector3(), []);
  const level = useRef(0);
  useFrame(({ clock, camera }) => {
    const geo = ref.current?.geometry;
    const s = sim.current;
    if (!geo) return;
    level.current += ((s.sel >= 0 ? 1 : 0) - level.current) * (animate ? 0.12 : 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    if (level.current < 0.01) {
      for (let i = 0; i < FLOW; i++) col.setXYZ(i, 0, 0, 0);
      col.needsUpdate = true;
      return;
    }
    const L = Math.max(0, s.sel);
    rightXZ(camera, r);
    const ox = r.x * s.slide[L];
    const oz = r.z * s.slide[L];
    const y0 = slabY(L) + s.lift[L] + SLAB_H;
    const y1 = TOP_Y - SLAB_H * 0.5;
    seeds.forEach((sd, i) => {
      const p = (sd.off + clock.elapsedTime * 0.34) % 1;
      const e = p * p * (3 - 2 * p);
      // Arc: start over the slid-out slab, bow outward, land on the top slab centre.
      const bow = Math.sin(p * Math.PI) * 0.55;
      pos.setXYZ(i, (ox + sd.x) * (1 - e) + sd.x * 0.2 * e + r.x * bow, y0 + (y1 - y0) * e, (oz + sd.z) * (1 - e) + sd.z * 0.2 * e + r.z * bow);
      tmp.copy(cols[L]).lerp(amber, e);
      const fade = Math.min(1, p * 8) * Math.min(1, (1 - p) * 6) * level.current * 1.6;
      col.setXYZ(i, tmp.r * fade, tmp.g * fade, tmp.b * fade);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers[0], 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers[1], 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        size={0.26}
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

const TICKS = 6;
/** Green ticks that pop in around the column during the "verify" stage of the tour. */
function Ticks({ sim }: { sim: React.RefObject<Sim> }) {
  const tex = useMemo(() => tickTexture(), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: TICKS }, (_, i) => {
        const a = (i / TICKS) * Math.PI * 2 + 0.5;
        return { x: Math.cos(a) * 1.55, z: Math.sin(a) * 1.55, y: 1 + (i % 3) * 0.78 + hash(i) * 0.2 };
      }),
    [],
  );
  useFrame(() => {
    const s = sim.current;
    refs.current.forEach((sp, i) => {
      if (!sp) return;
      const t0 = 5 + i * 0.34;
      const pop = s.playing ? clamp01((s.tourT - t0) / 0.3) : 0;
      const out = s.playing ? clamp01((s.tourT - 8.4) / 0.9) : 0;
      const k = easeOut(pop) * (1 - out);
      const over = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1;
      sp.visible = k > 0.01;
      sp.scale.setScalar(0.42 * k * over);
      sp.position.y = seeds[i].y + pop * 0.18;
      (sp.material as THREE.SpriteMaterial).opacity = k;
    });
  });
  return (
    <>
      {seeds.map((sd, i) => (
        <sprite
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[sd.x, sd.y, sd.z]}
          visible={false}
        >
          <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </>
  );
}

function SettlingCubes({ grades, sim }: { grades?: Partial<Record<GradeKey, number>>; sim: React.RefObject<Sim> }) {
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
  const wasPlaying = useRef(false);

  /** `drop(k)` = seconds since cube k started dropping; `clear` = 0..1 sink-away progress. */
  const pose = (drop: (k: number) => number, clear: number, y: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    order.forEach((cell, k) => {
      const gx = (cell % GRID) - (GRID - 1) / 2;
      const gz = Math.floor(cell / GRID) - (GRID - 1) / 2;
      const restY = y + SLAB_H / 2 + CUBE / 2 + 0.005;
      let yy = restY;
      let sc = 1;
      const local = drop(k);
      if (clear > 0) sc = Math.max(0.001, 1 - clear);
      else if (local < 0) sc = 0.001;
      else if (local < 0.55) {
        const p = local / 0.55;
        yy = restY + (1 - easeOut(p)) * 0.9;
        sc = 0.4 + 0.6 * easeOut(p);
      }
      dummy.position.set(gx * CELL, yy, gz * CELL);
      dummy.scale.setScalar(sc);
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
    pose(() => 10, 0, TOP_Y);
  });
  useFrame(({ clock }) => {
    const s = sim.current;
    const y = TOP_Y + s.lift[N_LAYERS] + (1 - easeOut(s.reveal[N_LAYERS])) * 1.3;
    if (s.playing) {
      // Scripted: cubes fall in during the last stage, spiralling out from the centre.
      const t = s.tourT - 7.45;
      pose((k) => t - k * 0.055, 0, y);
      wasPlaying.current = true;
      return;
    }
    if (wasPlaying.current) {
      // Resume the ambient cycle already "settled", so nothing jumps when the tour ends.
      wasPlaying.current = false;
      setCubeOffset(s, n * DROP_EVERY + 0.1 - (clock.elapsedTime + 2));
    }
    if (!animate) {
      pose(() => 10, 0, y);
      return;
    }
    const tc = (((clock.elapsedTime + 2 + s.cubeOffset) % cycle) + cycle) % cycle;
    const clearing = tc > n * DROP_EVERY + HOLD;
    pose((k) => tc - k * DROP_EVERY, clearing ? (tc - (n * DROP_EVERY + HOLD)) / 0.9 : 0, y);
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[CUBE, CUBE, CUBE]} />
      <meshStandardMaterial roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}

/**
 * Eases every slab's lift / glow / slide / reveal toward what hover, selection and the tour ask for.
 * Without animation (reduced motion) values snap, and a single frame is requested per change.
 */
function Animator({ sim, tick }: { sim: React.RefObject<Sim>; tick: number }) {
  const { animate } = useSceneMotion();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [tick, animate, invalidate]);
  useFrame((_, dt) => advanceSim(sim.current, dt, animate));
  return null;
}

/** OrbitControls sets touch-action: none; restore vertical panning so swipes still scroll the page. */
function allowPageScroll(el: HTMLElement) {
  el.style.touchAction = "pan-y";
}

/**
 * Drag-to-rotate. Damped, limited tilt, no zoom or pan. Auto-rotate stops on touch and resumes after
 * 3 s idle (never under reduced motion, never mid-tour or while a layer is selected).
 */
function Controls({ sim, hold }: { sim: React.RefObject<Sim>; hold: boolean }) {
  const { animate } = useSceneMotion();
  const gl = useThree((s) => s.gl);
  const ctl = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef(hold);
  const animRef = useRef(animate);
  useEffect(() => {
    holdRef.current = hold;
    animRef.current = animate;
  });

  const resume = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ctl.current && animRef.current && !holdRef.current) ctl.current.autoRotate = true;
    }, 3000);
  }, []);

  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    // Vertical swipes should still scroll the page on touch screens; horizontal drags rotate.
    allowPageScroll(gl.domElement);
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      c.autoRotate = false;
      sim.current.dragging = true;
    };
    const end = () => {
      sim.current.dragging = false;
      resume();
    };
    c.addEventListener("start", start);
    c.addEventListener("end", end);
    return () => {
      c.removeEventListener("start", start);
      c.removeEventListener("end", end);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gl, resume, sim]);

  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    if (!animate || hold) c.autoRotate = false;
    else if (!sim.current.dragging) c.autoRotate = true;
  }, [animate, hold, resume, sim]);

  return (
    <OrbitControls
      ref={ctl}
      enableZoom={false}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minPolarAngle={0.8}
      maxPolarAngle={1.32}
      autoRotateSpeed={0.7}
    />
  );
}

/** Shifts the picture left (a view offset, so it survives orbiting) to leave room for labels on the right. */
function ViewShift() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const shift = size.width < 560 ? size.width * 0.06 : size.width * 0.15;
    camera.setViewOffset(size.width, size.height, shift, 34, size.width, size.height);
    invalidate();
    return () => camera.clearViewOffset();
  }, [size.width, size.height, camera, invalidate]);
  return null;
}

/** Scales the stack down and lowers it on narrow canvases so the right-hand labels always fit. */
function Frame({ children, groupRef }: { children: React.ReactNode; groupRef: React.RefObject<THREE.Group | null> }) {
  const width = useThree((s) => s.size.width);
  const narrow = width < 560;
  return (
    <group ref={groupRef} position={[0, narrow ? -1.15 : -1.85, 0]} scale={narrow ? 0.66 : 1}>
      {children}
    </group>
  );
}

const IDLE_HINT = "Drag to rotate. Hover a layer to see what it is; click one to follow its evidence into the handover.";

export default function HeroStack({ layers = DEFAULT_LAYERS, grades, approvedLabel = "Approved handover", approvedSub }: HeroStackProps) {
  const ls = layers.slice(0, N_LAYERS);
  const reduced = usePrefersReducedMotion();
  const frame = useRef<THREE.Group>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sim = useRef<Sim>(newSim());
  const [tick, setTick] = useState(0);
  const [hover, setHoverState] = useState(-1);
  const [sel, setSel] = useState(-1);
  const [stage, setStage] = useState(-1); // tour stage 0..3, -1 = not playing
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    document.body.style.cursor = hover >= 0 ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  const copyFor = (i: number) => {
    if (i === N_LAYERS) return { title: approvedLabel, color: PALETTE.amber, ...APPROVED_COPY };
    const l = ls[i];
    const c = COPY[l.key];
    return {
      title: l.label,
      color: l.color,
      blurb: l.blurb ?? c?.blurb ?? `${l.label}${l.sub ? `: ${l.sub}` : ""}.`,
      extracts: l.extracts ?? c?.extracts ?? `Baton extracts decisions, owners and risks from ${l.label}, each with an exact quote.`,
    };
  };

  const setHover = useCallback((i: number) => {
    sim.current.hover = i;
    setHoverState(i);
    setTick((t) => t + 1);
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const stopTour = useCallback(() => {
    clearTimers();
    const s = sim.current;
    s.playing = false;
    s.tourT = 0;
    setStage(-1);
    setTick((t) => t + 1);
  }, []);
  useEffect(() => () => clearTimers(), []);

  const pick = useCallback(
    (i: number) => {
      if (sim.current.playing) return;
      const next = i === N_LAYERS || sim.current.sel === i ? -1 : i;
      sim.current.sel = next;
      setSel(next);
      setTick((t) => t + 1);
    },
    [],
  );

  const goStage = useCallback((n: number) => {
    const s = sim.current;
    s.playing = true;
    s.sel = -1;
    setSel(-1);
    setStage(n);
    // Reduced motion: no clock, jump to the end pose of this stage.
    s.tourT = Math.min(TOUR_SECONDS, (n + 1) * 2.5 - (n === 3 ? 0 : 0.1));
    setTick((t) => t + 1);
  }, []);

  const play = () => {
    clearTimers();
    const s = sim.current;
    if (reduced) {
      goStage(0);
      return;
    }
    s.sel = -1;
    setSel(-1);
    s.playing = true;
    s.tourStart = performance.now();
    s.tourT = 0;
    setStage(0);
    STAGE_AT.slice(1).forEach((at, k) => timers.current.push(setTimeout(() => setStage(k + 1), at * 1000)));
    timers.current.push(setTimeout(stopTour, TOUR_SECONDS * 1000 + 600));
    setTick((t) => t + 1);
  };
  const next = () => (stage >= 3 ? stopTour() : goStage(stage + 1));

  const labels: LabelSpec[] = [
    ...ls.map((l) => ({ key: l.key, title: l.label, sub: l.sub, color: l.color })),
    { key: "approved", title: approvedLabel, short: "Approved", sub: approvedSub, color: PALETTE.amber, strong: true },
  ];

  const touring = stage >= 0;
  const focus = sel >= 0 ? sel : hover;
  const card = !touring && focus >= 0 ? copyFor(focus) : null;
  const caption = touring
    ? { head: `${stage + 1} of 4 · ${TOUR[stage].head}`, text: TOUR[stage].text, color: stage === 2 ? PALETTE.verified : PALETTE.amber }
    : sel >= 0
      ? { head: `${copyFor(sel).title} → Approved handover`, text: copyFor(sel).extracts, color: copyFor(sel).color }
      : null;

  return (
    <div className="relative h-full w-full">
      <SceneCanvas
        camera={{ position: [7.2, 6.1, 7.2], fov: 26, near: 0.1, far: 60 }}
        label={`Diagram: ${ls.map((l) => l.label).join(", ")} records rise into one approved handover, graded claim by claim. Drag to rotate; hover or click a layer to learn what it contributes.`}
        onPointerMissed={() => {
          if (sim.current.sel >= 0) pick(sim.current.sel);
        }}
      >
        <StudioLights />
        <ViewShift />
        <Controls sim={sim} hold={touring || sel >= 0} />
        <Animator sim={sim} tick={tick} />
        <Frame groupRef={frame}>
          {ls.map((l, i) => (
            <Slab key={l.key} i={i} color={l.color} base={0.42} edge={0.32} sim={sim} />
          ))}
          <Slab i={N_LAYERS} color={PALETTE.amber} base={0.62} edge={0.55} sim={sim} />
          <Particles layers={ls} sim={sim} />
          <Flow layers={ls} sim={sim} />
          <Ticks sim={sim} />
          <SettlingCubes grades={grades} sim={sim} />
          <HitBoxes sim={sim} onHover={setHover} onPick={pick} />
        </Frame>
        <LabelTracker labels={labels} refs={labelRefs} frame={frame} sim={sim} />
      </SceneCanvas>
      <LabelOverlay labels={labels} refs={labelRefs} active={focus} />

      {card && (
        <div
          className="pointer-events-none absolute top-3 left-3 w-[min(230px,60%)] rounded-md border bg-surface/95 px-3 py-2 shadow-lg shadow-black/40"
          style={{ borderColor: `${card.color}88` }}
          role="status"
        >
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-text">
            <span className="size-2 rounded-[2px]" style={{ background: card.color }} />
            {card.title}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">{card.blurb}</p>
          {sel < 0 && focus !== N_LAYERS && <p className="mt-1 font-mono text-[10.5px] text-subtle">Click to trace it into the handover</p>}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-1 pb-1">
        <div className="min-h-[52px] min-w-0 flex-1 rounded-md border border-border bg-surface/90 px-3 py-2" aria-live="polite">
          {caption ? (
            <>
              <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-wide uppercase" style={{ color: caption.color }}>
                {caption.head}
                {touring && (
                  <span className="ml-auto flex gap-1" aria-hidden>
                    {TOUR.map((_, i) => (
                      <span
                        key={i}
                        className="h-0.5 w-5 rounded-full"
                        style={{ background: i <= stage ? PALETTE.amber : PALETTE.border }}
                      />
                    ))}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-text">{caption.text}</p>
            </>
          ) : (
            <p className="text-[12px] leading-snug text-muted">{IDLE_HINT}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {touring && reduced && (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-[12.5px] font-medium text-text transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {stage >= 3 ? <Check className="size-3.5" /> : <SkipForward className="size-3.5" />}
              {stage >= 3 ? "Done" : "Next step"}
            </button>
          )}
          <button
            type="button"
            onClick={touring ? stopTour : play}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {touring ? <Square className="size-3.5" /> : sel >= 0 ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
            {touring ? "Stop" : "Play how it works"}
          </button>
        </div>
      </div>
    </div>
  );
}
