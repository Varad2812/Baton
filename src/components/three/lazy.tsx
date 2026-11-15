"use client";

/**
 * Lazy, client-only entry points for the 3D scenes. Import these, never the scene files directly:
 * three.js stays out of the server bundle and the first-load JS, and each fallback reserves exactly
 * the scene's box so nothing shifts when the canvas mounts.
 */
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { STAIRCASE_HEIGHT } from "./constants";
import type { PipelineStaircaseProps } from "./PipelineStaircase";
import type { EvidenceConstellationProps } from "./EvidenceConstellation";
import type { HeroStackProps } from "./HeroStack";

/** If WebGL is unavailable (old GPU, blocked context) show the static fallback instead of crashing the page. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Mounts children only once the box is near the viewport (`near`) or once the main thread is idle
 * (`idle`, for above-the-fold scenes), so WebGL setup never competes with hydration.
 */
function Deferred({ mode, fallback, children }: { mode: "near" | "idle"; fallback: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (mode === "idle") {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(() => setReady(true), { timeout: 800 });
        return () => window.cancelIdleCallback?.(id);
      }
      const t = setTimeout(() => setReady(true), 200);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);
  return (
    <div ref={ref} className="h-full w-full">
      {ready ? children : fallback}
    </div>
  );
}

/** Static isometric outline of the hero stack, shown while three.js loads (and as no-WebGL fallback). */
export function HeroStackFallback({ className }: { className?: string }) {
  const layers = ["#4C7BD9", "#7A4FD1", "#1F9E89", "#8A8FA3"];
  const slab = (cy: number, color: string, op: number) => (
    <path
      key={cy}
      d={`M 300 ${cy - 62} L 410 ${cy} L 300 ${cy + 62} L 190 ${cy} Z`}
      fill={color}
      fillOpacity={op}
      stroke="#ffffff"
      strokeOpacity={0.16}
    />
  );
  return (
    <div className={cn("relative h-full w-full", className)} aria-hidden>
      <svg viewBox="0 0 600 560" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {layers.map((c, i) => slab(430 - i * 62, c, 0.14))}
        {slab(150, "#E8A33D", 0.22)}
      </svg>
    </div>
  );
}

const HeroStackInner = dynamic<HeroStackProps>(() => import("./HeroStack"), {
  ssr: false,
  loading: () => <HeroStackFallback />,
});

export function LazyHeroStack(props: HeroStackProps) {
  return (
    <SceneBoundary fallback={<HeroStackFallback />}>
      <Deferred mode="idle" fallback={<HeroStackFallback />}>
        <HeroStackInner {...props} />
      </Deferred>
    </SceneBoundary>
  );
}

function StaircaseFallback({ compact }: { compact?: boolean }) {
  return (
    <div
      className="flex w-full items-end justify-center gap-2 px-8 pb-10"
      style={{ height: compact ? STAIRCASE_HEIGHT.compact : STAIRCASE_HEIGHT.full }}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="w-10 animate-pulse rounded-sm border border-border bg-surface-2" style={{ height: `${20 + i * 14}%` }} />
      ))}
    </div>
  );
}

const PipelineStaircaseInner = dynamic<PipelineStaircaseProps>(() => import("./PipelineStaircase"), {
  ssr: false,
  loading: () => <StaircaseFallback />,
});
const PipelineStaircaseCompact = dynamic<PipelineStaircaseProps>(() => import("./PipelineStaircase"), {
  ssr: false,
  loading: () => <StaircaseFallback compact />,
});

export function LazyPipelineStaircase(props: PipelineStaircaseProps) {
  return (
    <SceneBoundary fallback={<StaircaseFallback compact={props.compact} />}>
      <Deferred mode="near" fallback={<StaircaseFallback compact={props.compact} />}>
        {props.compact ? <PipelineStaircaseCompact {...props} /> : <PipelineStaircaseInner {...props} />}
      </Deferred>
    </SceneBoundary>
  );
}

function ConstellationFallback() {
  return (
    <div className="relative h-full w-full" aria-hidden>
      <div className="absolute inset-y-[12%] left-1/2 aspect-square -translate-x-1/2 animate-pulse rounded-full border border-dashed border-border" />
    </div>
  );
}

const EvidenceConstellationInner = dynamic<EvidenceConstellationProps>(() => import("./EvidenceConstellation"), {
  ssr: false,
  loading: () => <ConstellationFallback />,
});

/** Size the constellation with `className` (default 300px tall); the fallback fills the same box. */
export function LazyEvidenceConstellation({ className, ...props }: EvidenceConstellationProps) {
  return (
    <div className={cn("relative h-[300px] w-full", className)}>
      <SceneBoundary fallback={<ConstellationFallback />}>
        <Deferred mode="near" fallback={<ConstellationFallback />}>
          <EvidenceConstellationInner {...props} className="absolute inset-0 h-full" />
        </Deferred>
      </SceneBoundary>
    </div>
  );
}
