"use client";

/**
 * Knowledge-at-risk radar: each area of the project is a tower on a grid. Height = risk (0-100),
 * colour = owner concentration (teal: shared knowledge, amber, red: one person knows it). Code areas
 * are square towers, handover sections hexagonal. Hover shows the details, click selects the area,
 * drag rotates. Reduced motion: static frame, no auto-rotate, towers at full height.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PALETTE, SceneCanvas, StudioLights, useSceneMotion } from "./shared";

export type RadarTower = {
  key: string;
  label: string;
  kind: "code" | "section";
  risk: number;
  /** 0..1: share of the area held by its top person. */
  concentration: number;
  detail: string;
};

export type RiskRadarProps = {
  towers: RadarTower[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
};

const SPACING = 1.7;
const MAX_H = 3.2;

export function concentrationColor(c: number): string {
  const teal = new THREE.Color(PALETTE.verified);
  const amber = new THREE.Color(PALETTE.amber);
  const red = new THREE.Color(PALETTE.conflicting);
  const out = c < 0.6 ? teal.clone().lerp(amber, Math.max(0, (c - 0.3) / 0.3)) : amber.clone().lerp(red, Math.min(1, (c - 0.6) / 0.35));
  return `#${out.getHexString()}`;
}

function Tower({
  t,
  position,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  t: RadarTower;
  position: [number, number, number];
  hovered: boolean;
  selected: boolean;
  onHover: (k: string | null) => void;
  onSelect?: (k: string) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const { animate } = useSceneMotion();
  const target = 0.12 + (Math.max(0, Math.min(100, t.risk)) / 100) * MAX_H;
  const init = animate ? 0.05 : target;
  const grown = useRef(init);
  const color = concentrationColor(t.concentration);

  useFrame((_, dt) => {
    if (!mesh.current) return;
    grown.current = animate ? THREE.MathUtils.damp(grown.current, target, 4, dt) : target;
    mesh.current.scale.y = grown.current;
    mesh.current.position.y = grown.current / 2;
  });

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        scale={[1, init, 1]}
        position={[0, init / 2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(t.key);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(t.key);
        }}
      >
        {t.kind === "code" ? <boxGeometry args={[0.95, 1, 0.95]} /> : <cylinderGeometry args={[0.55, 0.55, 1, 6]} />}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered || selected ? 0.55 : 0.12}
          roughness={0.55}
          metalness={0.1}
          transparent
          opacity={hovered || selected ? 1 : 0.88}
        />
      </mesh>
      {(selected || hovered) && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 0.8, 32]} />
          <meshBasicMaterial color={PALETTE.amber} />
        </mesh>
      )}
      <Html position={[0, -0.05, 0.75]} center distanceFactor={9} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <div className="whitespace-nowrap font-mono text-[10px] text-muted">{t.label}</div>
      </Html>
      {hovered && (
        <Html position={[0, target + 0.4, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }} zIndexRange={[20, 10]}>
          <div className="w-56 rounded-md border border-border bg-surface/95 px-2.5 py-2 text-left shadow-lg">
            <div className="text-[12px] font-medium text-text">{t.label}</div>
            <div className="mt-0.5 font-mono text-[11px] text-primary">risk {Math.round(t.risk)} · top person {Math.round(t.concentration * 100)}%</div>
            <div className="mt-1 text-[11px] leading-snug text-muted">{t.detail}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({ towers, selected, onSelect }: RiskRadarProps) {
  const [hover, setHover] = useState<string | null>(null);
  const { animate } = useSceneMotion();
  const cols = Math.max(2, Math.ceil(Math.sqrt(towers.length)));
  const positions = useMemo(
    () =>
      towers.map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const rows = Math.ceil(towers.length / cols);
        return [(c - (cols - 1) / 2) * SPACING, 0, (r - (rows - 1) / 2) * SPACING] as [number, number, number];
      }),
    [towers, cols],
  );
  const size = cols * SPACING + 1;
  return (
    <>
      <StudioLights glow={false} />
      <gridHelper args={[size, cols * 2, PALETTE.border, PALETTE.surface2]} position={[0, 0, 0]} />
      {towers.map((t, i) => (
        <Tower key={t.key} t={t} position={positions[i]} hovered={hover === t.key} selected={selected === t.key} onHover={setHover} onSelect={onSelect} />
      ))}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableDamping
        minPolarAngle={0.35}
        maxPolarAngle={1.25}
        autoRotate={animate && !hover && !selected}
        autoRotateSpeed={0.5}
      />
    </>
  );
}

export default function RiskRadar({ towers, selected, onSelect, className }: RiskRadarProps) {
  const label = `Knowledge-at-risk radar: ${towers.length} areas. Highest risk: ${towers
    .slice(0, 3)
    .map((t) => `${t.label} (${Math.round(t.risk)})`)
    .join(", ")}.`;
  return (
    <div className={className} style={{ touchAction: "pan-y" }}>
      <SceneCanvas camera={{ position: [6.5, 6, 7.5], fov: 38 }} label={label}>
        <Scene towers={towers} selected={selected} onSelect={onSelect} />
      </SceneCanvas>
      <RadarLegend />
    </div>
  );
}

export function RadarLegend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-bg/85 px-2.5 py-1.5 text-[11px] text-muted">
      <span>Height = risk</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-8 rounded-sm" style={{ background: `linear-gradient(90deg, ${PALETTE.verified}, ${PALETTE.amber}, ${PALETTE.conflicting})` }} />
        shared → one person
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 bg-muted" /> code area
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-muted" /> handover section
      </span>
      <span className="text-subtle">Drag to rotate · click a tower</span>
    </div>
  );
}
