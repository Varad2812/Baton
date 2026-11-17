"use client";

/**
 * Shared plumbing for every R3F scene: one Canvas wrapper that caps DPR, pauses when the
 * scene is off-screen or the tab is hidden, and renders a single static frame under
 * prefers-reduced-motion. Scenes read `useSceneMotion()` to decide whether to animate.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, type CanvasProps } from "@react-three/fiber";
import { cn } from "@/lib/utils";

export const PALETTE = {
  bg: "#0B0D15",
  surface: "#11141F",
  surface2: "#171B28",
  border: "#252A3A",
  text: "#E8EAF2",
  muted: "#A9AEC2",
  subtle: "#6B7186",
  amber: "#E8A33D",
  verified: "#1F9E89",
  single: "#6190E6",
  inferred: "#E8A33D",
  conflicting: "#E8665B",
  missing: "#8A8FA3",
  testimony: "#7A4FD1",
} as const;

export type GradeKey = "VERIFIED" | "SINGLE_SOURCE" | "INFERRED" | "CONFLICTING" | "MISSING";
export type SourceKindKey =
  | "GITHUB_COMMIT"
  | "GITHUB_PR"
  | "GITHUB_ISSUE"
  | "DOC"
  | "CHAT"
  | "TASKS"
  | "TESTIMONY";
export type AccessKey = "PUBLIC" | "TEAM" | "RESTRICTED";

export const GRADE_HEX: Record<GradeKey, string> = {
  VERIFIED: PALETTE.verified,
  SINGLE_SOURCE: PALETTE.single,
  INFERRED: PALETTE.inferred,
  CONFLICTING: PALETTE.conflicting,
  MISSING: PALETTE.missing,
};

export const GRADE_NAME: Record<GradeKey, string> = {
  VERIFIED: "Confirmed",
  SINGLE_SOURCE: "Single source",
  INFERRED: "AI inference",
  CONFLICTING: "Conflicting",
  MISSING: "Missing",
};

/** Source colours match the hero stack layers: GitHub blue, chat violet, notes teal, tasks grey. */
export const KIND_HEX: Record<SourceKindKey, string> = {
  GITHUB_COMMIT: "#4C7BD9",
  GITHUB_PR: "#4C7BD9",
  GITHUB_ISSUE: "#4C7BD9",
  CHAT: "#7A4FD1",
  DOC: "#1F9E89",
  TASKS: "#8A8FA3",
  TESTIMONY: "#B48CF0",
};

export const KIND_NAME: Record<SourceKindKey, string> = {
  GITHUB_COMMIT: "Commits",
  GITHUB_PR: "Pull request",
  GITHUB_ISSUE: "Issue",
  CHAT: "Chat",
  DOC: "Doc / notes",
  TASKS: "Task board",
  TESTIMONY: "Testimony",
};

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useActive(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    const vis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [ref]);
  return inView && visible;
}

type Motion = { animate: boolean; reduced: boolean };
const MotionContext = createContext<Motion>({ animate: true, reduced: false });
/** `animate` is false when off-screen or reduced motion: scenes should jump to their final pose. */
export const useSceneMotion = () => useContext(MotionContext);

export function SceneCanvas({
  children,
  className,
  camera,
  orthographic,
  label,
  onPointerMissed,
}: {
  children: ReactNode;
  className?: string;
  camera: CanvasProps["camera"];
  orthographic?: boolean;
  /** Accessible description of the scene (canvas content is invisible to screen readers). */
  label: string;
  onPointerMissed?: CanvasProps["onPointerMissed"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useActive(ref);
  const reduced = usePrefersReducedMotion();
  const animate = active && !reduced;
  return (
    <div ref={ref} className={cn("relative h-full w-full", className)} role="img" aria-label={label}>
      <MotionContext.Provider value={{ animate, reduced }}>
        <Canvas
          dpr={[1, 1.75]}
          camera={camera}
          orthographic={orthographic}
          // "demand" keeps the last frame on screen and only re-renders on invalidate():
          // off-screen scenes cost nothing and reduced motion gets a single static frame.
          frameloop={animate ? "always" : "demand"}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          onPointerMissed={onPointerMissed}
          style={{ position: "absolute", inset: 0 }}
        >
          <MotionContext.Provider value={{ animate, reduced }}>{children}</MotionContext.Provider>
        </Canvas>
      </MotionContext.Provider>
    </div>
  );
}

/** Soft studio rig: low ambient, cool sky / warm ground hemisphere, one key, one rim. */
export function StudioLights({ glow = true }: { glow?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#cfd6ff", "#1a1408", 0.55]} />
      <directionalLight position={[5, 8, 6]} intensity={1.15} />
      <directionalLight position={[-6, 3, -4]} intensity={0.35} color="#8fa2ff" />
      {glow && <pointLight position={[0, 4.2, 0]} intensity={6} distance={7} decay={1.6} color={PALETTE.amber} />}
    </>
  );
}
