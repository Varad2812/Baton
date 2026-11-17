import type { Grade } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { GRADE_COLOR, GRADE_HELP, GRADE_LABEL, GRADE_SHORT } from "@/lib/views/format";

/** Grade marker: coloured dot + label. Never styled as fact unless VERIFIED. */
export function GradeChip({
  grade,
  className,
  compact = false,
}: {
  grade: Grade;
  className?: string;
  compact?: boolean;
}) {
  const color = GRADE_COLOR[grade];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-1.5 text-xs font-medium leading-none",
        grade === "INFERRED" && "border-dashed",
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
      title={`${GRADE_LABEL[grade]}. ${GRADE_HELP[grade]}`}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", grade === "MISSING" && "bg-transparent ring-1 ring-current")}
        style={grade === "MISSING" ? undefined : { background: color }}
      />
      {!compact && GRADE_SHORT[grade]}
    </span>
  );
}

export function GradeDot({ grade, className }: { grade: Grade; className?: string }) {
  return (
    <span
      role="img"
      aria-label={GRADE_LABEL[grade]}
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: GRADE_COLOR[grade] }}
    />
  );
}
