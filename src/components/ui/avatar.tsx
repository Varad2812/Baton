import { cn } from "@/lib/utils";

const PALETTE = ["#4C7BD9", "#1F9E89", "#C9813A", "#B5566A", "#7A8F3C", "#3E8DA8", "#9A6FB0", "#A0794A"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  const parts = name.replace(/^(Prof|Dr)\.\s*/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const color = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      title={name}
      aria-label={name}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        // Initials lifted toward white so they keep 4.5:1 contrast on the tinted chip.
        color: `color-mix(in srgb, ${color} 50%, #ffffff)`,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
