"use client";

/**
 * EvidenceConstellation: every claim and the sources it quotes, as a 3D force-directed graph.
 * Sources are larger matte blocks coloured by kind with a ring for access (none = Public, solid =
 * Team, dashed amber double ring = Restricted). Claims are small spheres coloured by grade.
 * SUPPORTS edges are faint lines in the claim's grade colour; CONTRADICTS edges are red dashed.
 * Verified claims (many sources) are pulled into the middle; single-source and inferred drift out;
 * MISSING claims have no evidence, so they float on the rim as hollow spheres.
 *
 * Usage (import the lazy wrapper so three.js stays out of the main bundle):
 *
 *   import { LazyEvidenceConstellation } from "@/components/three/lazy";
 *
 *   <LazyEvidenceConstellation
 *     className="h-[300px]"
 *     nodes={[
 *       { type: "source", id: "src_pr_84", kind: "GITHUB_PR", access: "TEAM", title: "PR #84 Move auth to Supabase" },
 *       { type: "source", id: "src_budget", kind: "DOC", access: "RESTRICTED", title: "Budget & sponsors" },
 *       { type: "claim", id: "clm_auth", grade: "VERIFIED", title: "Auth moved to Supabase on 12 Mar" },
 *     ]}
 *     edges={[{ claimId: "clm_auth", sourceId: "src_pr_84", relation: "SUPPORTS" }]}
 *     hiddenCount={2}
 *     onClaimClick={(id) => router.push(`/p/festflow/ledger?claim=${id}`)}
 *   />
 *
 * Interaction: drag to rotate (damped, no zoom/pan; auto-rotate pauses while you look and resumes 3 s after
 * the last drag). Hover a claim: its lines and sources light up and everything else dims, and the camera eases
 * toward it. Hover a source: "N claims from <source>". Click a source: only its claims stay lit (click empty
 * space or "Clear" to reset). A legend explains colours and lines.
 *
 * Layout is computed once per (nodes, edges) with a small deterministic solver; at most 120
 * nodes are drawn (all sources first, then claims by grade severity); the rest are counted.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GRADE_HEX,
  GRADE_NAME,
  KIND_HEX,
  KIND_NAME,
  PALETTE,
  SceneCanvas,
  StudioLights,
  useSceneMotion,
  type AccessKey,
  type GradeKey,
  type SourceKindKey,
} from "./shared";

export type ConstellationSourceNode = { type: "source"; id: string; kind: SourceKindKey; access: AccessKey; title?: string };
export type ConstellationClaimNode = { type: "claim"; id: string; grade: GradeKey; title: string };
export type ConstellationNode = ConstellationSourceNode | ConstellationClaimNode;
export type ConstellationEdge = { claimId: string; sourceId: string; relation: "SUPPORTS" | "CONTRADICTS" };
export type EvidenceConstellationProps = {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  /** Claims the current persona may not see; shown only as a count. */
  hiddenCount?: number;
  onClaimClick?: (id: string) => void;
  /** Called when a source is clicked (the scene also filters to that source's claims). */
  onSourceClick?: (id: string) => void;
  /** Keep this claim highlighted (with its sources) while nothing is hovered, e.g. the ledger's open claim. */
  highlightClaimId?: string;
  className?: string;
};

const MAX_NODES = 120;
const SEVERITY: Record<GradeKey, number> = { CONFLICTING: 0, MISSING: 1, INFERRED: 2, SINGLE_SOURCE: 3, VERIFIED: 4 };
const R_SOURCE = 0.13;
const R_CLAIM = 0.06;

function hash(s: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

type Placed = ConstellationNode & { p: THREE.Vector3; degree: number };

/**
 * Deterministic force layout: seeded positions, O(n²) repulsion (n ≤ 120), springs on edges,
 * weak gravity, cooling step size. Sources start on a sphere shell grouped by kind; claims start
 * at the centroid of their sources. 260 iterations is ~4M cheap ops: a few ms, run once.
 */
function solve(nodes: ConstellationNode[], edges: ConstellationEdge[]): Placed[] {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const links = edges
    .map((e) => [idx.get(e.claimId), idx.get(e.sourceId)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);
  const degree = new Array(nodes.length).fill(0);
  links.forEach(([a, b]) => {
    degree[a]++;
    degree[b]++;
  });
  const kinds = [...new Set(nodes.filter((n) => n.type === "source").map((n) => (n as ConstellationSourceNode).kind))];
  const pos = nodes.map((n) => {
    if (n.type === "source") {
      const k = kinds.indexOf(n.kind);
      const a = (k / Math.max(1, kinds.length)) * Math.PI * 2 + hash(n.id) * 0.9;
      const el = (hash(n.id, 7) - 0.5) * 1.6;
      return new THREE.Vector3(Math.cos(a) * 2.4 * Math.cos(el), Math.sin(el) * 2.4, Math.sin(a) * 2.4 * Math.cos(el));
    }
    return new THREE.Vector3((hash(n.id, 1) - 0.5) * 3, (hash(n.id, 2) - 0.5) * 3, (hash(n.id, 3) - 0.5) * 3);
  });
  // Claims start at their sources' centroid (after sources are seeded).
  links.forEach(([c]) => pos[c].multiplyScalar(0));
  const counts = new Array(nodes.length).fill(0);
  links.forEach(([c, s]) => {
    pos[c].add(pos[s]);
    counts[c]++;
  });
  pos.forEach((p, i) => {
    if (counts[i] > 0) p.divideScalar(counts[i]).add(new THREE.Vector3(hash(nodes[i].id, 4) - 0.5, hash(nodes[i].id, 5) - 0.5, hash(nodes[i].id, 6) - 0.5).multiplyScalar(0.4));
  });

  const n = nodes.length;
  const disp = pos.map(() => new THREE.Vector3());
  const d = new THREE.Vector3();
  let step = 0.12;
  for (let it = 0; it < 260; it++) {
    disp.forEach((v) => v.set(0, 0, 0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        d.subVectors(pos[i], pos[j]);
        const dist2 = Math.max(d.lengthSq(), 0.01);
        const bothSources = nodes[i].type === "source" && nodes[j].type === "source";
        const f = (bothSources ? 0.6 : 0.16) / dist2;
        d.normalize().multiplyScalar(f);
        disp[i].add(d);
        disp[j].sub(d);
      }
    }
    for (const [a, b] of links) {
      d.subVectors(pos[b], pos[a]);
      const len = d.length();
      const f = (len - 1.3) * 0.05;
      d.normalize().multiplyScalar(f);
      disp[a].add(d);
      disp[b].sub(d);
    }
    for (let i = 0; i < n; i++) {
      // Unanchored nodes (MISSING claims) are pushed to a rim; everything else feels gravity.
      const r = pos[i].length();
      if (degree[i] === 0) disp[i].add(d.copy(pos[i]).normalize().multiplyScalar((3.1 - r) * 0.08));
      else disp[i].add(d.copy(pos[i]).multiplyScalar(-0.012));
      const m = disp[i].length();
      if (m > step) disp[i].multiplyScalar(step / m);
      pos[i].add(disp[i]);
    }
    step *= 0.992;
  }
  // Normalise to a radius of ~2.6 so any dataset fits the same camera.
  const maxR = Math.max(...pos.map((p) => p.length()), 0.001);
  return nodes.map((node, i) => ({ ...node, p: pos[i].multiplyScalar(2.9 / maxR), degree: degree[i] }));
}

function ringGeometry() {
  const pts: THREE.Vector3[] = [];
  const r = R_SOURCE + 0.07;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** Access ring around a source: none = Public, solid = Team, dashed amber double ring = Restricted. */
function Ring({ access }: { access: AccessKey }) {
  const objects = useMemo(() => {
    const geo = ringGeometry();
    if (access === "TEAM") {
      return [new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: PALETTE.muted, transparent: true, opacity: 0.5 }))];
    }
    if (access === "RESTRICTED") {
      const dashed = new THREE.Line(
        geo,
        new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0.95 }),
      );
      dashed.computeLineDistances();
      const outer = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.35 }));
      outer.scale.setScalar(1.32);
      return [dashed, outer];
    }
    return [];
  }, [access]);
  if (objects.length === 0) return null;
  return (
    <Billboard>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </Billboard>
  );
}

const DIM = 0.1;
const bgColor = new THREE.Color(PALETTE.bg);

/**
 * Who is lit. `anchor` (hover, else the source filter, else highlightClaimId) lights itself and its
 * neighbours; a source filter additionally keeps the other sources of those claims at half strength.
 * Returns a level per node id (1 lit, 0.5 context, DIM faded) and a predicate for edges.
 */
function useFocus(placed: Placed[], edges: ConstellationEdge[], hover: string | null, filter: string | null, pin: string | undefined) {
  return useMemo(() => {
    const anchor = hover ?? filter ?? pin ?? null;
    if (anchor === null) return { anchor, levels: null as Map<string, number> | null, lit: () => true };
    const levels = new Map<string, number>();
    const claimsOf = new Map<string, string[]>();
    const sourcesOf = new Map<string, string[]>();
    for (const e of edges) {
      (claimsOf.get(e.sourceId) ?? claimsOf.set(e.sourceId, []).get(e.sourceId)!).push(e.claimId);
      (sourcesOf.get(e.claimId) ?? sourcesOf.set(e.claimId, []).get(e.claimId)!).push(e.sourceId);
    }
    const isSource = (id: string) => claimsOf.has(id) || placed.some((p) => p.id === id && p.type === "source");
    const set = (id: string, v: number) => levels.set(id, Math.max(levels.get(id) ?? 0, v));
    if (isSource(anchor)) {
      set(anchor, 1);
      for (const c of claimsOf.get(anchor) ?? []) {
        set(c, 1);
        if (filter === anchor && hover === null) for (const s of sourcesOf.get(c) ?? []) set(s, 0.5);
      }
    } else {
      set(anchor, 1);
      for (const s of sourcesOf.get(anchor) ?? []) set(s, 1);
    }
    const lit = (e: ConstellationEdge) => (levels.get(e.claimId) ?? 0) >= 1 && (levels.get(e.sourceId) ?? 0) >= (isSource(anchor) ? 0.5 : 1) && (isSource(anchor) ? e.sourceId === anchor || filter === anchor : e.claimId === anchor);
    return { anchor, levels, lit };
  }, [placed, edges, hover, filter, pin]);
}

function EdgeLines({ placed, edges, lit, active }: { placed: Placed[]; edges: ConstellationEdge[]; lit: (e: ConstellationEdge) => boolean; active: boolean }) {
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const { supports, contradicts } = useMemo(() => {
    const sPos: number[] = [];
    const sCol: number[] = [];
    const cPos: number[] = [];
    const cCol: number[] = [];
    const c = new THREE.Color();
    const red = new THREE.Color(PALETTE.conflicting);
    for (const e of edges) {
      const a = byId.get(e.claimId);
      const b = byId.get(e.sourceId);
      if (!a || !b) continue;
      const on = lit(e);
      if (e.relation === "CONTRADICTS") {
        cPos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
        c.copy(red).multiplyScalar(on ? 1 : 0.18);
        cCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      } else {
        sPos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
        c.set(a.type === "claim" ? GRADE_HEX[a.grade] : PALETTE.muted).multiplyScalar(on ? (active ? 1.5 : 0.6) : 0.07);
        sCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
    sg.setAttribute("color", new THREE.Float32BufferAttribute(sCol, 3));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
    cg.setAttribute("color", new THREE.Float32BufferAttribute(cCol, 3));
    return { supports: sg, contradicts: cg };
  }, [byId, edges, lit, active]);
  const dashed = useRef<THREE.LineSegments>(null);
  useEffect(() => {
    dashed.current?.computeLineDistances();
  }, [contradicts]);
  useEffect(() => () => {
    supports.dispose();
    contradicts.dispose();
  }, [supports, contradicts]);
  return (
    <>
      <lineSegments geometry={supports}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <lineSegments ref={dashed} geometry={contradicts}>
        <lineDashedMaterial vertexColors dashSize={0.09} gapSize={0.06} transparent opacity={0.95} />
      </lineSegments>
    </>
  );
}

function Spheres({
  items,
  radius,
  hollow,
  cube,
  levels,
  anchor,
  onHover,
  onClick,
}: {
  items: Placed[];
  radius: number;
  hollow?: boolean;
  /** Sources render as small matte blocks, the same language as the hero stack. */
  cube?: boolean;
  levels: Map<string, number> | null;
  anchor: string | null;
  onHover: (id: string | null) => void;
  onClick?: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.copy(it.p);
      const lv = levels ? (levels.get(it.id) ?? DIM) : 1;
      const base = it.type === "claim" ? 1 + Math.min(it.degree, 4) * 0.12 : 1 + Math.min(it.degree, 12) * 0.04;
      o.scale.setScalar(base * (it.id === anchor ? 1.5 : levels && lv >= 1 ? 1.2 : 1));
      if (cube) o.rotation.set(0.6, 0.78, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(it.type === "claim" ? GRADE_HEX[it.grade] : KIND_HEX[it.kind]);
      if (levels && lv < 1) c.lerp(bgColor, lv >= 0.5 ? 0.45 : 0.88);
      m.setColorAt(i, c);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [items, invalidate, cube, levels, anchor]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onHover(items[e.instanceId].id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 4) return; // a drag, not a click
        if (e.instanceId !== undefined) onClick?.(items[e.instanceId].id);
      }}
    >
      {cube ? <boxGeometry args={[radius * 1.7, radius * 1.7, radius * 1.7]} /> : <sphereGeometry args={[radius, hollow ? 10 : 18, hollow ? 8 : 12]} />}
      {hollow ? (
        <meshBasicMaterial wireframe transparent opacity={0.6} />
      ) : (
        <meshStandardMaterial roughness={cube ? 0.85 : 0.55} metalness={0} />
      )}
    </instancedMesh>
  );
}

/** OrbitControls sets touch-action: none; restore vertical panning so swipes still scroll the page. */
function allowPageScroll(el: HTMLElement) {
  el.style.touchAction = "pan-y";
}

/**
 * Drag-to-rotate camera (damped, no zoom or pan) plus the "ease toward the node" move: the orbit target
 * dollies in on the focused node (along the ray to it, so it stays under the pointer) and back. Auto-rotate pauses while looking and resumes
 * 3 s after the last drag; never under reduced motion.
 */
function Controls({ focusPoint, hold, group }: { focusPoint: THREE.Vector3 | null; hold: boolean; group: React.RefObject<THREE.Group | null> }) {
  const { animate } = useSceneMotion();
  const gl = useThree((s) => s.gl);
  const ctl = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const holdRef = useRef(hold);
  const animRef = useRef(animate);
  useEffect(() => {
    holdRef.current = hold;
    animRef.current = animate;
  });
  const [goal, rest, step, applied] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const, []);

  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    allowPageScroll(gl.domElement);
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      dragging.current = true;
      c.autoRotate = false;
    };
    const end = () => {
      dragging.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (ctl.current && animRef.current && !holdRef.current) ctl.current.autoRotate = true;
      }, 3000);
    };
    c.addEventListener("start", start);
    c.addEventListener("end", end);
    return () => {
      c.removeEventListener("start", start);
      c.removeEventListener("end", end);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gl]);

  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    c.autoRotate = animate && !hold && !dragging.current;
  }, [animate, hold]);

  // Dolly toward the focused node along the camera's own ray to it: a pure translation of camera and target,
  // so the node keeps its screen position (it stays under the pointer) while the scene eases in around it.
  useFrame(({ camera }, dt) => {
    const c = ctl.current;
    if (!c || !animate) return;
    rest.copy(camera.position).sub(applied);
    if (focusPoint && group.current) {
      group.current.updateWorldMatrix(true, false);
      goal.copy(focusPoint).applyMatrix4(group.current.matrixWorld).sub(rest).multiplyScalar(0.24);
    } else goal.set(0, 0, 0);
    step.copy(goal).sub(applied).multiplyScalar(1 - Math.exp(-dt * 5));
    camera.position.add(step);
    c.target.add(step);
    applied.add(step);
  });

  return (
    <OrbitControls
      ref={ctl}
      enableZoom={false}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minPolarAngle={0.5}
      maxPolarAngle={Math.PI - 0.5}
      autoRotateSpeed={0.4}
    />
  );
}

export default function EvidenceConstellation({
  nodes,
  edges,
  hiddenCount = 0,
  onClaimClick,
  onSourceClick,
  highlightClaimId,
  className,
}: EvidenceConstellationProps) {
  const { drawn, overflow } = useMemo(() => {
    const sources = nodes.filter((n): n is ConstellationSourceNode => n.type === "source");
    const claims = nodes
      .filter((n): n is ConstellationClaimNode => n.type === "claim")
      .sort((a, b) => SEVERITY[a.grade] - SEVERITY[b.grade]);
    const keepSources = sources.slice(0, Math.min(sources.length, MAX_NODES - Math.min(claims.length, 60)));
    const keepClaims = claims.slice(0, MAX_NODES - keepSources.length);
    return {
      drawn: [...keepSources, ...keepClaims] as ConstellationNode[],
      overflow: nodes.length - keepSources.length - keepClaims.length,
    };
  }, [nodes]);
  const placed = useMemo(() => solve(drawn, edges), [drawn, edges]);
  const groups = useMemo(
    () => ({
      sources: placed.filter((p) => p.type === "source"),
      claims: placed.filter((p) => p.type === "claim" && (p.degree > 0 || p.grade !== "MISSING")),
      missing: placed.filter((p) => p.type === "claim" && p.degree === 0 && p.grade === "MISSING"),
    }),
    [placed],
  );
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const pin = highlightClaimId && placed.some((p) => p.id === highlightClaimId) ? highlightClaimId : undefined;
  const hovered = hover ? placed.find((p) => p.id === hover) : undefined;
  const filterNode = filter ? placed.find((p) => p.id === filter) : undefined;
  const { anchor, levels, lit } = useFocus(placed, edges, hover, filter, pin);
  const focusNode = anchor ? placed.find((p) => p.id === anchor) : undefined;
  const group = useRef<THREE.Group>(null);
  const nClaims = drawn.filter((n) => n.type === "claim").length;
  const nSources = drawn.length - nClaims;
  const filterCount = filterNode ? edges.filter((e) => e.sourceId === filterNode.id).length : 0;

  useEffect(() => {
    document.body.style.cursor = hovered ? (hovered.type === "claim" && !onClaimClick ? "" : "pointer") : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered, onClaimClick]);

  const pickSource = (id: string) => {
    setFilter((f) => (f === id ? null : id));
    onSourceClick?.(id);
  };
  const clear = () => setFilter(null);

  return (
    <div className={cn("relative h-[300px] w-full", className)}>
      <SceneCanvas
        camera={{ position: [0, 0, 8.4], fov: 38, near: 0.1, far: 60 }}
        label={`Evidence constellation: ${nClaims} claims linked to ${nSources} sources${hiddenCount ? `, ${hiddenCount} hidden for this role` : ""}. Drag to rotate; hover for details, click a source to filter its claims.`}
        onPointerMissed={() => {
          setHover(null);
          clear();
        }}
      >
        <StudioLights glow={false} />
        <Controls focusPoint={(hovered ?? (pin ? focusNode : undefined))?.p ?? null} hold={hover !== null || filter !== null} group={group} />
        <group ref={group} rotation={[0.18, 0.4, 0]}>
          <EdgeLines placed={placed} edges={edges} lit={lit} active={anchor !== null} />
          <Spheres items={groups.sources} radius={R_SOURCE} cube levels={levels} anchor={anchor} onHover={setHover} onClick={pickSource} />
          <Spheres items={groups.claims} radius={R_CLAIM} levels={levels} anchor={anchor} onHover={setHover} onClick={onClaimClick} />
          <Spheres items={groups.missing} radius={R_CLAIM * 1.1} hollow levels={levels} anchor={anchor} onHover={setHover} onClick={onClaimClick} />
          {groups.sources.map((s) =>
            s.type === "source" && s.access !== "PUBLIC" ? (
              <group key={s.id} position={s.p}>
                <Ring access={s.access} />
              </group>
            ) : null,
          )}
          {hovered && (
            <Html position={hovered.p} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
              <div className="ml-3 -translate-y-1/2 w-max max-w-[240px] rounded-md border border-border bg-surface-2 px-2.5 py-1.5 shadow-lg shadow-black/40">
                {hovered.type === "claim" ? (
                  <>
                    <div className="text-[12px] leading-snug text-text">{hovered.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: GRADE_HEX[hovered.grade] }}>
                      <span className="size-1.5 rounded-full" style={{ background: GRADE_HEX[hovered.grade] }} />
                      {GRADE_NAME[hovered.grade]}
                      <span className="text-subtle">· {hovered.degree} source{hovered.degree === 1 ? "" : "s"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] leading-snug text-text">
                      <span className="font-mono tabular-nums">{hovered.degree}</span> claim{hovered.degree === 1 ? "" : "s"} from {hovered.title ?? KIND_NAME[hovered.kind]}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-subtle">
                      {KIND_NAME[hovered.kind]} · {hovered.access.toLowerCase()} · {filter === hovered.id ? "click to clear" : "click to filter"}
                    </div>
                  </>
                )}
              </div>
            </Html>
          )}
        </group>
      </SceneCanvas>

      {filterNode && filterNode.type === "source" && (
        <div className="absolute top-2 left-2 flex max-w-[70%] items-center gap-2 rounded-md border border-border bg-surface-2 py-1 pr-1 pl-2.5 text-[11.5px] text-muted">
          <span className="truncate">
            <span className="font-mono text-text tabular-nums">{filterCount}</span> claim{filterCount === 1 ? "" : "s"} from{" "}
            <span className="text-text">{filterNode.title ?? KIND_NAME[filterNode.kind]}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-border/60 hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="size-3" /> Clear
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-md border border-border/70 bg-bg/70 px-2 py-1.5 font-mono text-[10.5px] text-subtle">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {(Object.keys(GRADE_HEX) as GradeKey[]).map((g) => (
            <span key={g} className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ background: GRADE_HEX[g] }} />
              {g === "VERIFIED" ? "Confirmed" : GRADE_NAME[g]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-muted" />
            lines = evidence
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed" style={{ borderColor: PALETTE.conflicting }} />
            red dashed = contradiction
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-[1px] bg-muted" />
            cubes = sources
          </span>
        </div>
      </div>
      {(hiddenCount > 0 || overflow > 0) && (
        <div className="pointer-events-none absolute top-2 right-2 flex flex-col items-end gap-1 font-mono text-[10.5px]">
          {hiddenCount > 0 && (
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-muted">
              +{hiddenCount} hidden · request access
            </span>
          )}
          {overflow > 0 && <span className="text-subtle">showing {drawn.length} of {nodes.length}</span>}
        </div>
      )}
    </div>
  );
}
